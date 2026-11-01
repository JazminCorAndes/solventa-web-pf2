import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import { SIMULATED_PAYMENT_GATEWAY } from './simulated-payment.gateway';
import { SimulatedPaymentRecord } from './simulated-payment.models';
import { SimulatedPaymentService } from './simulated-payment.service';
import {
  CONFIRMED_PAYMENT,
  PAYMENT_SELECTION,
  PAYMENT_SUBSCRIPTION,
  REJECTED_PAYMENT,
} from './simulated-payment.testing';

describe('SimulatedPaymentService', () => {
  const originalMode = environment.dataAccessMode;
  const gateway = { load: vi.fn(), confirm: vi.fn() };
  const offers = { loadSelection: vi.fn() };
  const storageKey = `solventa.payment.attempt.${PAYMENT_SUBSCRIPTION.id}`;
  const receiptKey = `solventa.payment.receipt.${PAYMENT_SUBSCRIPTION.id}`;
  let service: SimulatedPaymentService;

  beforeEach(() => {
    environment.dataAccessMode = 'backend';
    vi.resetAllMocks();
    window.sessionStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(receiptKey);
    gateway.load.mockReturnValue(of(null));
    gateway.confirm.mockReturnValue(of(CONFIRMED_PAYMENT));
    offers.loadSelection.mockReturnValue(of(PAYMENT_SELECTION));
    TestBed.configureTestingModule({
      providers: [
        { provide: SIMULATED_PAYMENT_GATEWAY, useValue: gateway },
        { provide: OFFER_GATEWAY, useValue: offers },
      ],
    });
    service = TestBed.inject(SimulatedPaymentService);
  });

  afterEach(() => {
    environment.dataAccessMode = originalMode;
    window.sessionStorage.removeItem(storageKey);
    window.sessionStorage.removeItem(receiptKey);
    vi.restoreAllMocks();
  });

  it('loads the accepted backend amount without creating a payment', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));

    expect(offers.loadSelection).toHaveBeenCalledWith(PAYMENT_SUBSCRIPTION.quoteId);
    expect(service.selection()).toEqual(PAYMENT_SELECTION);
    expect(service.payment()).toBeNull();
    expect(service.canConfirm()).toBe(true);
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it('recovers the persisted payment on reload without posting again', async () => {
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(
      service.load({
        ...PAYMENT_SUBSCRIPTION,
        saga: CONFIRMED_PAYMENT.saga,
      }),
    );

    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(service.canConfirm()).toBe(false);
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it('keeps the same idempotency key after a lost response and a new service instance', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await expect(firstValueFrom(service.confirm())).resolves.toBeNull();
    const firstKey = window.sessionStorage.getItem(storageKey);
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(service.errorKey()).toBe('payment.errors.unavailable');
    expect(service.canConfirm()).toBe(true);

    const reloaded = TestBed.runInInjectionContext(() => new SimulatedPaymentService());
    await firstValueFrom(reloaded.load(PAYMENT_SUBSCRIPTION));
    await expect(firstValueFrom(reloaded.confirm())).resolves.toEqual(CONFIRMED_PAYMENT);

    expect(gateway.confirm).toHaveBeenNthCalledWith(1, PAYMENT_SUBSCRIPTION.quoteId, firstKey);
    expect(gateway.confirm).toHaveBeenNthCalledWith(2, PAYMENT_SUBSCRIPTION.quoteId, firstKey);
    expect(reloaded.errorKey()).toBeNull();
    expect(reloaded.canConfirm()).toBe(false);
    expect(reloaded.canRetryIssuance()).toBe(false);
  });

  it('retries issuance with the original key after recovering the persisted payment', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await firstValueFrom(service.confirm());
    const originalKey = window.sessionStorage.getItem(storageKey);

    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    const reloaded = TestBed.runInInjectionContext(() => new SimulatedPaymentService());
    expect(reloaded.canRetryIssuance()).toBe(false);
    await firstValueFrom(reloaded.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    expect(reloaded.canConfirm()).toBe(false);
    expect(reloaded.canRetryIssuance()).toBe(true);
    expect(gateway.confirm).toHaveBeenCalledOnce();

    await expect(firstValueFrom(reloaded.confirm())).resolves.toEqual(CONFIRMED_PAYMENT);

    expect(gateway.confirm).toHaveBeenNthCalledWith(2, PAYMENT_SUBSCRIPTION.quoteId, originalKey);
    expect(window.sessionStorage.getItem(storageKey)).toBe(originalKey);
  });

  it('does not invent an attempt key when only the persisted payment can be recovered', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));

    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(service.errorKey()).toBe('payment.errors.retryKeyUnavailable');
    expect(service.canConfirm()).toBe(false);
    expect(service.canRetryIssuance()).toBe(false);
    await firstValueFrom(service.confirm());
    expect(gateway.confirm).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it.each([null, 'another-key'])(
    'does not replace the original key when it changes after the status lookup: %s',
    async (changedKey) => {
      window.sessionStorage.setItem(storageKey, 'original-key');
      gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
      await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
      if (changedKey === null) window.sessionStorage.removeItem(storageKey);
      else window.sessionStorage.setItem(storageKey, changedKey);

      await expect(firstValueFrom(service.confirm())).resolves.toBeNull();

      expect(service.errorKey()).toBe('payment.errors.retryKeyUnavailable');
      expect(service.canRetryIssuance()).toBe(false);
      expect(gateway.confirm).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(storageKey)).toBe(changedKey);
    },
  );

  it('rejects a different payment returned by an issuance retry', async () => {
    window.sessionStorage.setItem(storageKey, 'original-key');
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    gateway.confirm.mockReturnValue(
      of({ ...CONFIRMED_PAYMENT, id: 'different-payment', reference: 'SIM-different-payment' }),
    );

    await expect(firstValueFrom(service.confirm())).resolves.toBeNull();

    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(service.errorKey()).toBe('payment.errors.conflict');
    expect(gateway.confirm).toHaveBeenCalledWith(PAYMENT_SUBSCRIPTION.quoteId, 'original-key');
  });

  async function rejectFirstAttempt(): Promise<string> {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(of(REJECTED_PAYMENT));
    await expect(firstValueFrom(service.confirm())).resolves.toEqual(REJECTED_PAYMENT);
    return gateway.confirm.mock.calls[0][1];
  }

  it('requires a separate explicit action to create a new attempt after definitive rejection', async () => {
    const rejectedKey = await rejectFirstAttempt();
    expect(service.canConfirm()).toBe(false);
    expect(service.canRetryIssuance()).toBe(false);
    expect(service.canStartNewAttempt()).toBe(true);
    expect(service.payment()).not.toHaveProperty('confirmedAt');
    await expect(firstValueFrom(service.startNewAttempt())).resolves.toEqual(CONFIRMED_PAYMENT);
    expect(gateway.confirm).toHaveBeenCalledTimes(2);
    expect(gateway.confirm.mock.calls[1][1]).not.toBe(rejectedKey);
    expect(service.canStartNewAttempt()).toBe(false);
    await firstValueFrom(service.startNewAttempt());
    expect(gateway.confirm).toHaveBeenCalledTimes(2);
  });

  it('never enables a new key when GET still returns the previous rejection after an ambiguous new attempt', async () => {
    const rejectedKey = await rejectFirstAttempt();
    gateway.confirm.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await firstValueFrom(service.startNewAttempt());
    const newKey = gateway.confirm.mock.calls[1][1];
    expect(newKey).not.toBe(rejectedKey);
    gateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    const reloaded = TestBed.runInInjectionContext(() => new SimulatedPaymentService());
    await firstValueFrom(reloaded.load(PAYMENT_SUBSCRIPTION));
    expect(reloaded.canStartNewAttempt()).toBe(false);
    expect(reloaded.canRecoverAttempt()).toBe(true);
    expect(gateway.confirm).toHaveBeenCalledTimes(2);
    await expect(firstValueFrom(reloaded.confirm())).resolves.toEqual(CONFIRMED_PAYMENT);
    expect(gateway.confirm).toHaveBeenNthCalledWith(3, PAYMENT_SUBSCRIPTION.quoteId, newKey);
    expect(reloaded.canStartNewAttempt()).toBe(false);
  });

  it('resolves an ambiguous rejection with the same key before allowing another attempt', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    await firstValueFrom(service.confirm());
    const originalKey = gateway.confirm.mock.calls[0][1];
    gateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    expect(service.canStartNewAttempt()).toBe(false);
    gateway.confirm.mockReturnValueOnce(of(REJECTED_PAYMENT));
    await expect(firstValueFrom(service.confirm())).resolves.toEqual(REJECTED_PAYMENT);
    expect(gateway.confirm).toHaveBeenNthCalledWith(2, PAYMENT_SUBSCRIPTION.quoteId, originalKey);
    expect(service.canStartNewAttempt()).toBe(true);
  });

  it('does not let an old rejected response replace a confirmed payment learned during a new attempt', async () => {
    await rejectFirstAttempt();
    const pending = new Subject<SimulatedPaymentRecord>();
    gateway.confirm.mockReturnValueOnce(pending);
    const result = firstValueFrom(service.startNewAttempt());
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    pending.next(REJECTED_PAYMENT);
    await expect(result).resolves.toBeNull();
    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(service.errorKey()).toBe('payment.errors.conflict');
    expect(service.canStartNewAttempt()).toBe(false);
    await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    expect(service.canRetryIssuance()).toBe(false);
    expect(service.errorKey()).toBe('payment.errors.retryKeyUnavailable');
  });

  it('does not downgrade a known confirmation when a subsequent GET returns an old rejection', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    await firstValueFrom(service.confirm());
    gateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    expect(service.payment()).toBeNull();
    expect(service.errorKey()).toBe('payment.errors.conflict');
    expect(service.canStartNewAttempt()).toBe(false);
    expect(gateway.confirm).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'does not forget a confirmation after an empty GET (new instance: %s)',
    async (newInstance) => {
      await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
      await firstValueFrom(service.confirm());
      const active = newInstance
        ? TestBed.runInInjectionContext(() => new SimulatedPaymentService())
        : service;
      await firstValueFrom(active.load(PAYMENT_SUBSCRIPTION));
      expect(active.errorKey()).toBe('payment.errors.conflict');
      expect(active.canConfirm()).toBe(false);
      expect(active.canStartNewAttempt()).toBe(false);
      expect(gateway.confirm).toHaveBeenCalledOnce();
    },
  );

  it('preserves confirmed identity across service instances without restricting a new attempt after rejection', async () => {
    await rejectFirstAttempt();
    await firstValueFrom(service.startNewAttempt());
    const reloaded = TestBed.runInInjectionContext(() => new SimulatedPaymentService());
    gateway.load.mockReturnValue(
      of({
        ...CONFIRMED_PAYMENT,
        id: 'different-confirmation',
        reference: 'SIM-different-confirmation',
      }),
    );
    await firstValueFrom(reloaded.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    expect(reloaded.errorKey()).toBe('payment.errors.conflict');
    expect(reloaded.payment()).toBeNull();
    expect(reloaded.canRetryIssuance()).toBe(false);
    expect(gateway.confirm).toHaveBeenCalledTimes(2);
  });

  it('does not offer a further new key if storing a new attempt fails before its POST', async () => {
    const originalKey = await rejectFirstAttempt();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage is full.', 'QuotaExceededError');
    });
    await expect(firstValueFrom(service.startNewAttempt())).resolves.toBeNull();
    write.mockRestore();
    expect(service.unresolvedAttempt()).toBe(true);
    expect(service.canStartNewAttempt()).toBe(false);
    expect(window.sessionStorage.getItem(storageKey)).toBe(originalKey);
    expect(gateway.confirm).toHaveBeenCalledOnce();
    await firstValueFrom(service.confirm());
    expect(service.errorKey()).toBe('payment.errors.retryKeyUnavailable');
    expect(gateway.confirm).toHaveBeenCalledOnce();
  });

  it('blocks a new attempt when current offer or subscription validation fails', async () => {
    await rejectFirstAttempt();
    offers.loadSelection.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422 })),
    );
    gateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    await firstValueFrom(service.startNewAttempt());
    expect(gateway.confirm).toHaveBeenCalledOnce();
    expect(service.canStartNewAttempt()).toBe(false);
  });

  it('blocks missing or corrupt attempt receipts rather than replacing an unresolved key', async () => {
    await rejectFirstAttempt();
    window.sessionStorage.setItem(receiptKey, '{invalid');
    gateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    expect(service.errorKey()).toBe('payment.errors.retryKeyUnavailable');
    await firstValueFrom(service.startNewAttempt());
    expect(gateway.confirm).toHaveBeenCalledOnce();
  });

  it('blocks repeated issuance clicks and stops offering retries after authoritative issuance', async () => {
    window.sessionStorage.setItem(storageKey, 'original-key');
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load({ ...PAYMENT_SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga }));
    const pending = new Subject<SimulatedPaymentRecord>();
    gateway.confirm.mockReturnValue(pending);
    const result = firstValueFrom(service.confirm());

    expect(service.canRetryIssuance()).toBe(false);
    await expect(firstValueFrom(service.confirm())).resolves.toBeNull();
    expect(gateway.confirm).toHaveBeenCalledOnce();
    pending.next(CONFIRMED_PAYMENT);
    await result;
    await firstValueFrom(
      service.load({
        ...PAYMENT_SUBSCRIPTION,
        saga: { ...CONFIRMED_PAYMENT.saga, status: 'issued', version: 3 },
      }),
    );
    expect(service.canRetryIssuance()).toBe(false);
    await firstValueFrom(service.confirm());
    expect(gateway.confirm).toHaveBeenCalledOnce();
  });

  it('disables confirmation while the request is pending', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    const pending = new Subject<SimulatedPaymentRecord>();
    gateway.confirm.mockReturnValue(pending);
    const result = firstValueFrom(service.confirm());

    expect(service.confirming()).toBe(true);
    expect(service.canConfirm()).toBe(false);
    await expect(firstValueFrom(service.confirm())).resolves.toBeNull();
    expect(gateway.confirm).toHaveBeenCalledOnce();
    expect(service.errorKey()).toBeNull();
    pending.next(CONFIRMED_PAYMENT);
    await result;
    expect(service.confirming()).toBe(false);
    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
  });

  it.each([409, 422])('requires a status refresh after POST returns %s', async (status) => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    await firstValueFrom(service.confirm());

    expect(service.canConfirm()).toBe(false);
    expect(service.payment()).toBeNull();
    expect(service.confirming()).toBe(false);
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(gateway.confirm).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 401, key: 'session' },
    { status: 404, key: 'notFound' },
    { status: 409, key: 'conflict' },
    { status: 422, key: 'notAllowed' },
    { status: 503, key: 'unavailable' },
    { status: 0, key: 'unavailable' },
  ])('shows the real HTTP $status error without a cached success', async ({ status, key }) => {
    gateway.load.mockReturnValueOnce(of(CONFIRMED_PAYMENT));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.load.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status })));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));

    expect(service.errorKey()).toBe(`payment.errors.${key}`);
    expect(service.payment()).toBeNull();
    expect(service.selection()).toBeNull();
    expect(service.canConfirm()).toBe(false);
    expect(service.loading()).toBe(false);
  });

  it('does not permit payment when an accepted selection is blocked by an expired profile', async () => {
    offers.loadSelection.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'perfil_vencido' } })),
    );
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    await firstValueFrom(service.confirm());

    expect(service.selection()).toBeNull();
    expect(service.canConfirm()).toBe(false);
    expect(service.payment()).toBeNull();
    expect(service.errorKey()).toBe('payment.errors.notAllowed');
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it.each(['review', 'rejected'] as const)(
    'never loads or confirms a %s decision',
    async (status) => {
      await firstValueFrom(
        service.load({
          ...PAYMENT_SUBSCRIPTION,
          status,
          decision: { ...PAYMENT_SUBSCRIPTION.decision, result: status },
        }),
      );
      await firstValueFrom(service.confirm());

      expect(service.canConfirm()).toBe(false);
      expect(gateway.load).not.toHaveBeenCalled();
      expect(gateway.confirm).not.toHaveBeenCalled();
    },
  );

  it.each(['failed'] as const)('never starts another payment for saga %s', async (status) => {
    await firstValueFrom(
      service.load({
        ...PAYMENT_SUBSCRIPTION,
        saga: { ...PAYMENT_SUBSCRIPTION.saga, status },
      }),
    );

    expect(service.canConfirm()).toBe(false);
    expect(gateway.load).not.toHaveBeenCalled();
  });

  it('does not turn a missing payment into a retry after the saga is confirmed', async () => {
    await firstValueFrom(
      service.load({
        ...PAYMENT_SUBSCRIPTION,
        saga: CONFIRMED_PAYMENT.saga,
      }),
    );

    expect(service.canConfirm()).toBe(false);
    expect(service.errorKey()).toBe('payment.errors.unavailable');
  });

  it('loads the existing payment for issued subscriptions without permitting another confirmation', async () => {
    gateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    await firstValueFrom(
      service.load({
        ...PAYMENT_SUBSCRIPTION,
        saga: { ...PAYMENT_SUBSCRIPTION.saga, status: 'issued' },
      }),
    );
    expect(service.payment()).toEqual(CONFIRMED_PAYMENT);
    expect(service.canConfirm()).toBe(false);
    await firstValueFrom(service.confirm());
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...PAYMENT_SELECTION, confirmed: false },
    { ...PAYMENT_SELECTION, quoteId: 'another-quote' },
    { ...PAYMENT_SELECTION, offerId: 'another-offer' },
    { ...PAYMENT_SELECTION, offerVersion: 2 },
  ])('rejects a missing or mismatched backend selection %j', async (selection) => {
    offers.loadSelection.mockReturnValue(of(selection));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));

    expect(service.canConfirm()).toBe(false);
    expect(service.errorKey()).toBe('payment.errors.unavailable');
    expect(gateway.confirm).not.toHaveBeenCalled();
  });

  it.each([
    { quoteId: 'another-quote' },
    { subscriptionId: 'another-subscription' },
    { offerId: 'another-offer' },
    { offerVersion: 2 },
    { premium: { amount: 1, currency: 'COP' } },
    { premium: { amount: PAYMENT_SELECTION.premium.amount, currency: 'USD' } },
    { periodicity: 'mensual' as const },
  ])('rejects a mismatched persisted or confirmed payment %j', async (fields) => {
    gateway.load.mockReturnValueOnce(of({ ...CONFIRMED_PAYMENT, ...fields }));
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    expect(service.payment()).toBeNull();
    expect(service.errorKey()).toBe('payment.errors.unavailable');

    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    gateway.confirm.mockReturnValueOnce(of({ ...CONFIRMED_PAYMENT, ...fields }));
    await firstValueFrom(service.confirm());
    expect(service.payment()).toBeNull();
    expect(service.errorKey()).toBe('payment.errors.unavailable');
  });

  it('does not send a request if the retry key cannot be saved safely', async () => {
    await firstValueFrom(service.load(PAYMENT_SUBSCRIPTION));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    await firstValueFrom(service.confirm());

    expect(gateway.confirm).not.toHaveBeenCalled();
    expect(service.confirming()).toBe(false);
    expect(service.errorKey()).toBe('payment.errors.unavailable');
  });

  it('does not fabricate a successful payment in mock mode', async () => {
    const mode = environment.dataAccessMode;
    environment.dataAccessMode = 'mock';
    try {
      const mockService = TestBed.runInInjectionContext(() => new SimulatedPaymentService());
      await firstValueFrom(mockService.load(PAYMENT_SUBSCRIPTION));
      expect(mockService.available).toBe(false);
      expect(mockService.payment()).toBeNull();
      expect(gateway.load).not.toHaveBeenCalled();
    } finally {
      environment.dataAccessMode = mode;
    }
  });
});

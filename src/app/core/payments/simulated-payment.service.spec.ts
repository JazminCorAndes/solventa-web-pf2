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
} from './simulated-payment.testing';

describe('SimulatedPaymentService', () => {
  const originalMode = environment.dataAccessMode;
  const gateway = { load: vi.fn(), confirm: vi.fn() };
  const offers = { loadSelection: vi.fn() };
  const storageKey = `solventa.payment.attempt.${PAYMENT_SUBSCRIPTION.id}`;
  let service: SimulatedPaymentService;

  beforeEach(() => {
    environment.dataAccessMode = 'backend';
    vi.resetAllMocks();
    window.sessionStorage.removeItem(storageKey);
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

  it.each(['failed', 'issued'] as const)(
    'never starts another payment for saga %s',
    async (status) => {
      await firstValueFrom(
        service.load({
          ...PAYMENT_SUBSCRIPTION,
          saga: { ...PAYMENT_SUBSCRIPTION.saga, status },
        }),
      );

      expect(service.canConfirm()).toBe(false);
      expect(gateway.load).not.toHaveBeenCalled();
    },
  );

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

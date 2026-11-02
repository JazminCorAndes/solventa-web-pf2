import { signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import es from '../../../../public/assets/i18n/es.json';
import { OFFER_GATEWAY } from '../../core/offers/offer.gateway';
import { SIMULATED_PAYMENT_GATEWAY } from '../../core/payments/simulated-payment.gateway';
import { SimulatedPaymentRecord } from '../../core/payments/simulated-payment.models';
import {
  CONFIRMED_PAYMENT,
  PAYMENT_SELECTION,
  REJECTED_PAYMENT,
  PENDING_PAYMENT,
  PAYMENT_OWNER_ID,
} from '../../core/payments/simulated-payment.testing';
import { SubscriptionRecord } from '../../core/subscriptions/subscription.models';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { SubscriptionStatusPageComponent } from './subscription-status-page.component';

registerLocaleData(localeEsCo);

const SUBSCRIPTION: SubscriptionRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  quoteId: 'AQT-2026-ABCDEF1234',
  offerId: '20000000-0000-4000-8000-000000000001',
  offerVersion: 1,
  status: 'approved',
  ruleVersion: 'suscripcion-automatica-2026.1',
  createdAt: '2026-10-16T15:00:00Z',
  updatedAt: '2026-10-16T15:00:00Z',
  decision: {
    result: 'approved',
    ruleVersion: 'suscripcion-automatica-2026.1',
    decisionHash: 'a'.repeat(64),
    decidedAt: '2026-10-16T15:00:00Z',
  },
  saga: {
    status: 'payment_pending',
    version: 1,
    updatedAt: '2026-10-16T15:00:00Z',
  },
};

describe('SubscriptionStatusPageComponent', () => {
  const originalMode = environment.dataAccessMode;
  let fixture: ComponentFixture<SubscriptionStatusPageComponent>;
  const load = vi.fn();
  const subscription = signal<SubscriptionRecord | null>(SUBSCRIPTION);
  const loading = signal(false);
  const error = signal(false);
  const paymentGateway = { load: vi.fn(), confirm: vi.fn() };
  const offers = { loadSelection: vi.fn() };

  beforeEach(async () => {
    environment.dataAccessMode = 'backend';
    load.mockClear();
    paymentGateway.load.mockReset().mockReturnValue(of(null));
    paymentGateway.confirm.mockReset().mockReturnValue(of(CONFIRMED_PAYMENT));
    offers.loadSelection.mockReset().mockReturnValue(of(PAYMENT_SELECTION));
    subscription.set(SUBSCRIPTION);
    loading.set(false);
    error.set(false);
    await TestBed.configureTestingModule({
      imports: [
        SubscriptionStatusPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: SIMULATED_PAYMENT_GATEWAY, useValue: paymentGateway },
        { provide: OFFER_GATEWAY, useValue: offers },
        { provide: AuthService, useValue: { user: signal({ id: PAYMENT_OWNER_ID }) } },
        {
          provide: SubscriptionService,
          useValue: { subscription, loading, error, load },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionStatusPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    environment.dataAccessMode = originalMode;
    window.sessionStorage.removeItem(`solventa.payment.attempt.${SUBSCRIPTION.id}`);
    window.sessionStorage.removeItem(`solventa.payment.receipt.${SUBSCRIPTION.id}`);
  });

  it('shows the approved decision and operation identifier', () => {
    const text = fixture.nativeElement.textContent;

    expect(load).toHaveBeenCalled();
    expect(text).toContain('Estado de suscripción');
    expect(text).toContain(SUBSCRIPTION.id);
    expect(text).toContain('Aprobada');
    expect(text).toContain(es.payment.disclaimer);
    expect(text).toContain(es.payment.pending);
    expect(paymentGateway.confirm).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.success-icon')).not.toBeNull();
  });

  it('links confirmed payments to their own subscription, never back to acceptance', () => {
    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    subscription.set({
      ...SUBSCRIPTION,
      saga: { ...SUBSCRIPTION.saga, status: 'payment_confirmed' },
    });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toBe(
      `/app/cotizaciones/suscripcion/detalle?solicitud=${SUBSCRIPTION.quoteId}`,
    );
    expect(link.textContent).toContain(es.quoteSummary.viewSubscription);
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/aceptacion"]'),
    ).toBeNull();
  });

  it('renders the persisted subscription details and coverage without payment controls', () => {
    fixture.destroy();
    TestBed.inject(ActivatedRoute).snapshot.data['detail'] = true;
    subscription.set({
      ...SUBSCRIPTION,
      validFrom: '2026-10-18T12:00:00Z',
      validUntil: '2027-10-18T12:00:00Z',
      saga: { ...SUBSCRIPTION.saga, status: 'payment_confirmed' },
    });
    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    fixture = TestBed.createComponent(SubscriptionStatusPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.subscription.detailTitle);
    expect(fixture.nativeElement.textContent).toContain(SUBSCRIPTION.quoteId);
    expect(fixture.nativeElement.textContent).toContain('2027');
    expect(fixture.nativeElement.textContent).toContain(CONFIRMED_PAYMENT.reference);
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/app/cotizaciones');
  });

  it.each([
    { status: 'review' as const, label: 'En revisión' },
    { status: 'rejected' as const, label: 'Rechazada' },
  ])('shows $status without approval or payment instructions', ({ status, label }) => {
    subscription.set({
      ...SUBSCRIPTION,
      status,
      decision: { ...SUBSCRIPTION.decision, result: status },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.textContent).not.toContain('Aprobada');
    expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
    expect(fixture.nativeElement.querySelector('.payment-section')).toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
  });

  it.each([
    { status: 'payment_confirmed' as const, label: 'Pago confirmado' },
    { status: 'issued' as const, label: 'Póliza emitida' },
    { status: 'failed' as const, label: 'Emisión fallida' },
  ])('shows saga $status without requesting payment', ({ status, label }) => {
    subscription.set({ ...SUBSCRIPTION, saga: { ...SUBSCRIPTION.saga, status } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    if (status === 'failed') {
      expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
    }
  });

  it('hides cached success while loading', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consultando la suscripción');
    expect(fixture.nativeElement.textContent).not.toContain(SUBSCRIPTION.id);
  });

  it('shows a retry instead of cached success after failure', () => {
    error.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(SUBSCRIPTION.id);
    fixture.nativeElement.querySelector('button').click();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows a missing subscription without success', () => {
    subscription.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.subscription.empty);
    expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
  });

  it('shows the backend amount and periodicity and requires an explicit simulated confirmation', () => {
    const amount = fixture.nativeElement.querySelector('.payment-amount')?.textContent;
    expect(amount).toContain('12.345,67');
    expect(amount).toContain(es.offers.premiumLabels.por_vuelo);
    expect(fixture.nativeElement.textContent).toContain(es.payment.disclaimer);
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(paymentGateway.confirm).not.toHaveBeenCalled();

    fixture.nativeElement.querySelector('.confirm-payment').click();

    expect(paymentGateway.confirm).toHaveBeenCalledWith(SUBSCRIPTION.quoteId, expect.any(String));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('blocks double clicks, shows a failed attempt and allows a safe retry', () => {
    const pending = new Subject<SimulatedPaymentRecord>();
    paymentGateway.confirm.mockReturnValueOnce(pending);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.confirm-payment');
    button.click();
    fixture.detectChanges();
    button.click();
    fixture.componentInstance.confirmPayment();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(es.payment.confirming);
    expect(paymentGateway.confirm).toHaveBeenCalledOnce();

    pending.error(new HttpErrorResponse({ status: 503 }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.payment.errors.unavailable,
    );
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    expect(fixture.nativeElement.querySelector('.payment-confirmation')).toBeNull();
    expect(load).toHaveBeenCalledOnce();

    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    fixture.nativeElement.querySelector('.recover-payment').click();
    fixture.detectChanges();

    expect(paymentGateway.confirm).toHaveBeenCalledOnce();
    expect(paymentGateway.load).toHaveBeenLastCalledWith(
      SUBSCRIPTION.quoteId,
      paymentGateway.confirm.mock.calls[0][1],
    );
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.payment-confirmation')?.textContent).toContain(
      CONFIRMED_PAYMENT.reference,
    );
    expect(fixture.nativeElement.textContent).not.toContain('Póliza emitida');
  });

  it('recovers a confirmed payment on reload without another POST or a policy-success message', () => {
    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    subscription.set({ ...SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payment-confirmation')?.textContent).toContain(
      CONFIRMED_PAYMENT.reference,
    );
    expect(fixture.nativeElement.textContent).toContain(es.payment.disclaimer);
    expect(fixture.nativeElement.textContent).toContain('Pago confirmado');
    expect(fixture.nativeElement.textContent).not.toContain('Póliza emitida');
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    expect(paymentGateway.confirm).not.toHaveBeenCalled();
  });

  it('shows a pending result without confirmation, rejection or issuance and recovers with GET', () => {
    paymentGateway.confirm.mockReturnValueOnce(of(PENDING_PAYMENT));
    fixture.nativeElement.querySelector('.confirm-payment').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.payment.resultPending);
    expect(fixture.nativeElement.textContent).toContain(es.payment.createdAt);
    expect(fixture.nativeElement.textContent).not.toContain(es.payment.confirmedAt);
    expect(fixture.nativeElement.textContent).not.toContain(es.payment.rejectedAt);
    expect(fixture.nativeElement.textContent).not.toContain(es.subscription.sagaStatuses.issued);
    expect(fixture.nativeElement.querySelector('.retry-issuance')).toBeNull();
    expect(fixture.nativeElement.querySelector('.request-new-payment')).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    paymentGateway.load.mockReturnValue(of(PENDING_PAYMENT));
    fixture.nativeElement.querySelector('.recover-payment').click();
    fixture.detectChanges();
    expect(paymentGateway.load).toHaveBeenLastCalledWith(
      SUBSCRIPTION.quoteId,
      paymentGateway.confirm.mock.calls[0][1],
    );
    expect(paymentGateway.confirm).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.payment-pending')).not.toBeNull();
  });

  it('retries the original operation after a lost issuance acknowledgement, not a new payment', () => {
    paymentGateway.confirm.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 503 })),
    );
    fixture.nativeElement.querySelector('.confirm-payment').click();
    const originalKey = paymentGateway.confirm.mock.calls[0][1];
    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    subscription.set({ ...SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(es.payment.issuancePending);
    expect(fixture.nativeElement.textContent).not.toContain(es.subscription.sagaStatuses.issued);
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    fixture.nativeElement.querySelector('.retry-issuance').click();
    fixture.detectChanges();

    expect(paymentGateway.confirm).toHaveBeenNthCalledWith(2, SUBSCRIPTION.quoteId, originalKey);
    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).not.toContain(es.subscription.sagaStatuses.issued);
    subscription.set({
      ...SUBSCRIPTION,
      saga: { ...CONFIRMED_PAYMENT.saga, status: 'issued', version: 3 },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.subscription.sagaStatuses.issued);
    expect(fixture.nativeElement.querySelector('.retry-issuance')).toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
  });

  it('keeps confirmed payment visible but permits only status reads without the original attempt key', () => {
    paymentGateway.load.mockReturnValue(of(CONFIRMED_PAYMENT));
    subscription.set({ ...SUBSCRIPTION, saga: CONFIRMED_PAYMENT.saga });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(CONFIRMED_PAYMENT.reference);
    expect(fixture.nativeElement.textContent).toContain(es.payment.errors.retryKeyUnavailable);
    expect(fixture.nativeElement.querySelector('.retry-issuance')).toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    fixture.nativeElement.querySelector('.payment-section button').click();
    expect(load).toHaveBeenCalledTimes(2);
    expect(paymentGateway.confirm).not.toHaveBeenCalled();
  });

  it('requires preparation and explicit confirmation before rotating a rejected attempt key', () => {
    paymentGateway.confirm.mockReturnValueOnce(of(REJECTED_PAYMENT));
    fixture.nativeElement.querySelector('.confirm-payment').click();
    fixture.detectChanges();
    const originalKey = paymentGateway.confirm.mock.calls[0][1];
    const text = fixture.nativeElement.textContent;
    expect(text).toContain(es.payment.rejected);
    expect(text).toContain(es.payment.rejectedAt);
    expect(text).not.toContain(es.payment.confirmedAt);
    expect(text).not.toContain(es.payment.pending);
    expect(fixture.nativeElement.querySelector('.payment-confirmation')).toBeNull();
    expect(fixture.nativeElement.querySelector('.retry-issuance')).toBeNull();
    fixture.componentInstance.confirmNewAttempt();
    expect(paymentGateway.confirm).toHaveBeenCalledOnce();
    fixture.nativeElement.querySelector('.request-new-payment').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.payment.newAttemptBody);
    fixture.nativeElement.querySelector('.cancel-new-payment').click();
    fixture.detectChanges();
    expect(paymentGateway.confirm).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(`solventa.payment.attempt.${SUBSCRIPTION.id}`)).toBe(
      originalKey,
    );
    fixture.nativeElement.querySelector('.request-new-payment').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.confirm-new-payment').click();
    fixture.componentInstance.confirmNewAttempt();
    fixture.detectChanges();
    expect(paymentGateway.confirm).toHaveBeenCalledTimes(2);
    expect(paymentGateway.confirm.mock.calls[1][1]).not.toBe(originalKey);
    expect(fixture.nativeElement.querySelector('.request-new-payment')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(es.subscription.sagaStatuses.issued);
  });

  it('does not submit a confirmation prepared for an older rejection', () => {
    paymentGateway.confirm.mockReturnValueOnce(of(REJECTED_PAYMENT));
    fixture.componentInstance.confirmPayment();
    fixture.componentInstance.requestNewAttempt();
    paymentGateway.load.mockReturnValue(
      of({ ...REJECTED_PAYMENT, id: 'another-rejection', reference: 'SIM-another-rejection' }),
    );
    fixture.componentInstance.payments.load(SUBSCRIPTION).subscribe();
    fixture.componentInstance.confirmNewAttempt();
    expect(paymentGateway.confirm).toHaveBeenCalledOnce();
  });

  it('keeps rejection recovery available in detail without automatically starting another attempt', () => {
    fixture.destroy();
    TestBed.inject(ActivatedRoute).snapshot.data['detail'] = true;
    paymentGateway.load.mockReturnValue(of(REJECTED_PAYMENT));
    fixture = TestBed.createComponent(SubscriptionStatusPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-rejection')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.request-new-payment')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    expect(paymentGateway.confirm).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/app/cotizaciones');
  });

  it('does not enable confirmation after a failed status request', () => {
    paymentGateway.load.mockReturnValueOnce(
      throwError(
        () => new HttpErrorResponse({ status: 404, error: { code: 'solicitud_no_encontrada' } }),
      ),
    );
    subscription.set({ ...SUBSCRIPTION });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.payment.errors.notFound,
    );
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    expect(fixture.nativeElement.querySelector('.payment-confirmation')).toBeNull();
  });

  it('never exposes confirmation before the backend amount and payment status arrive', () => {
    const pending = new Subject<SimulatedPaymentRecord | null>();
    paymentGateway.load.mockReturnValueOnce(pending);
    subscription.set({ ...SUBSCRIPTION });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(es.payment.loading);
    expect(fixture.nativeElement.querySelector('.payment-amount')).toBeNull();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).toBeNull();
    pending.next(null);
    pending.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.confirm-payment')).not.toBeNull();
  });

  it('discards an in-flight payment lookup when the subscription changes to review', () => {
    const pending = new Subject<SimulatedPaymentRecord | null>();
    paymentGateway.load.mockReturnValueOnce(pending);
    subscription.set({ ...SUBSCRIPTION });
    fixture.detectChanges();
    subscription.set({
      ...SUBSCRIPTION,
      status: 'review',
      decision: { ...SUBSCRIPTION.decision, result: 'review' },
    });
    fixture.detectChanges();
    pending.next(CONFIRMED_PAYMENT);
    pending.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payment-section')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(es.subscription.statuses.review);
    expect(fixture.nativeElement.textContent).not.toContain(CONFIRMED_PAYMENT.reference);
    expect(paymentGateway.confirm).not.toHaveBeenCalled();
  });
});

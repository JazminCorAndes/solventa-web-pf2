import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject, tap, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { AuthService } from '../../core/auth/auth.service';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { InsuranceOffer, SelectedOfferRecord } from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { SubscriptionRecord } from '../../core/subscriptions/subscription.models';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { OfferAcceptancePageComponent } from './offer-acceptance-page.component';

registerLocaleData(localeEsCo);

const OFFER: InsuranceOffer = {
  id: 'offer-a',
  version: 1,
  name: 'Seguro Automotriz Pro',
  description: 'Cobertura extendida',
  premium: { amount: 189_900, currency: 'COP' },
  periodicity: 'mensual',
  coverageLabel: 'Daños propios y terceros',
  deductibleLabel: '$500.000 COP',
  validityLabel: 'Anual',
  liabilityLabel: '$1.000.000.000 COP',
  coverages: ['Asistencia en ruta'],
  conditions: ['Vehículo asegurable'],
  additionalBenefits: ['Auto de reemplazo'],
  recommended: true,
  status: 'available',
  validUntil: '2030-01-01T00:00:00.000Z',
};

const CONFIRMED_SELECTION: SelectedOfferRecord = {
  quoteId: 'AQT-2026-123456',
  offerId: OFFER.id,
  offerVersion: OFFER.version,
  offerName: OFFER.name,
  premium: OFFER.premium,
  periodicity: OFFER.periodicity,
  selectedAt: '2026-10-15T03:00:00.000Z',
  confirmed: true,
};

const SUBSCRIPTION: SubscriptionRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  quoteId: CONFIRMED_SELECTION.quoteId,
  offerId: OFFER.id,
  offerVersion: 1,
  status: 'approved',
  ruleVersion: 'suscripcion-automatica-2026.1',
  createdAt: '2026-10-15T03:01:00.000Z',
  updatedAt: '2026-10-15T03:01:00.000Z',
  decision: {
    result: 'approved',
    ruleVersion: 'suscripcion-automatica-2026.1',
    decisionHash: 'a'.repeat(64),
    decidedAt: '2026-10-15T03:01:00.000Z',
  },
  saga: {
    status: 'payment_pending',
    version: 1,
    updatedAt: '2026-10-15T03:01:00.000Z',
  },
};

describe('OfferAcceptancePageComponent', () => {
  let fixture: ComponentFixture<OfferAcceptancePageComponent>;
  const confirmedSelection = signal<SelectedOfferRecord | null>(null);
  const selectedOffer = signal<InsuranceOffer | null>(OFFER);
  const offersStatus = signal<'ready' | 'error'>('ready');
  const offersError = signal<string | null>(null);
  const confirmSelected = vi.fn(() => of(CONFIRMED_SELECTION));
  const startSubscription = vi.fn(() => of(SUBSCRIPTION));
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    confirmedSelection.set(null);
    selectedOffer.set(OFFER);
    offersStatus.set('ready');
    offersError.set(null);
    confirmSelected
      .mockReset()
      .mockImplementation(() =>
        of(CONFIRMED_SELECTION).pipe(tap((selection) => confirmedSelection.set(selection))),
      );
    startSubscription.mockReset().mockReturnValue(of(SUBSCRIPTION));
    await TestBed.configureTestingModule({
      imports: [
        OfferAcceptancePageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: OfferSelectionService,
          useValue: {
            selectedOffer,
            confirmedSelection,
            status: offersStatus,
            errorKey: offersError,
            load: vi.fn(),
            confirmSelected,
          },
        },
        {
          provide: QuoteRequestService,
          useValue: {
            latestRequest: signal({
              id: 'AQT-2026-123456',
              status: 'received',
              productId: 'automotive',
              customerType: 'natural',
              documentType: 'cc',
              nationalId: '1023456789',
              productData: { vehiclePlate: 'ABC123' },
              email: 'cliente@solventa.co',
              phone: '+573001234567',
              createdAt: '2026-10-15T02:00:00.000Z',
            }),
            products: signal([
              {
                id: 'automotive',
                name: 'Seguro Automotriz Total',
                description: 'Protección para tu vehículo',
                available: true,
              },
            ]),
            travelDestinations: signal([]),
            loadProducts: vi.fn(),
            loadTravelDestinations: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 'client-001',
              name: 'Natalia Córdoba',
              email: 'cliente@solventa.co',
              role: 'client',
              documentType: 'cc',
              nationalId: '1023456789',
              phone: '+573001234567',
            }),
          },
        },
        {
          provide: SubscriptionService,
          useValue: { start: startSubscription },
        },
      ],
    }).compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(OfferAcceptancePageComponent);
    fixture.detectChanges();
  });

  it('shows the selected plan, insurance data and policyholder', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Seguro Automotriz Pro');
    expect(text).toContain('ABC123');
    expect(text).toContain('Natalia Córdoba');
  });

  it('requires consent before confirming the selection', () => {
    const component = fixture.componentInstance;

    component.confirm();
    expect(confirmSelected).not.toHaveBeenCalled();

    component.accepted.set(true);
    component.confirm();
    expect(confirmSelected).toHaveBeenCalledOnce();
    expect(startSubscription).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/app/cotizaciones/suscripcion']);
  });

  function actionButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.actions button');
  }

  function acceptAndConfirm(): void {
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('mat-checkbox input');
    checkbox.click();
    fixture.detectChanges();
    actionButton().click();
    fixture.detectChanges();
  }

  it('shows a subscription error after acceptance and retries without accepting again', () => {
    startSubscription.mockReturnValueOnce(throwError(() => new Error('Service unavailable')));

    acceptAndConfirm();

    expect(confirmedSelection()).toEqual(CONFIRMED_SELECTION);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.acceptance.errors.subscription,
    );
    expect(actionButton().textContent).toContain('Proceder al pago');
    expect(actionButton().disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    actionButton().click();
    fixture.detectChanges();

    expect(confirmSelected).toHaveBeenCalledOnce();
    expect(startSubscription).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/app/cotizaciones/suscripcion']);
  });

  it('shows errors and blocks duplicate requests while retrying a restored acceptance', () => {
    confirmedSelection.set(CONFIRMED_SELECTION);
    const pending = new Subject<SubscriptionRecord>();
    startSubscription.mockReturnValueOnce(pending);
    fixture.detectChanges();

    actionButton().click();
    fixture.detectChanges();
    actionButton().click();
    fixture.componentInstance.continueWithSubscription();

    expect(actionButton().disabled).toBe(true);
    expect(actionButton().querySelector('mat-spinner')).not.toBeNull();
    expect(startSubscription).toHaveBeenCalledOnce();

    pending.error(new Error('Service unavailable'));
    fixture.detectChanges();

    expect(actionButton().disabled).toBe(false);
    expect(actionButton().querySelector('mat-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.acceptance.errors.subscription,
    );
    expect(navigate).not.toHaveBeenCalled();
    actionButton().click();

    expect(confirmSelected).not.toHaveBeenCalled();
    expect(startSubscription).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('does not start a subscription through continuation without an accepted offer', () => {
    fixture.componentInstance.continueWithSubscription();

    expect(startSubscription).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('blocks duplicate acceptance and subscription requests while confirmation is pending', () => {
    const pending = new Subject<SubscriptionRecord>();
    startSubscription.mockReturnValueOnce(pending);

    acceptAndConfirm();
    actionButton().click();
    fixture.componentInstance.confirm();
    fixture.componentInstance.continueWithSubscription();

    expect(actionButton().disabled).toBe(true);
    expect(confirmSelected).toHaveBeenCalledOnce();
    expect(startSubscription).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    pending.next(SUBSCRIPTION);
    fixture.detectChanges();

    expect(actionButton().disabled).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('recovers the button and shows an error if starting the subscription throws synchronously', () => {
    confirmedSelection.set(CONFIRMED_SELECTION);
    startSubscription.mockImplementationOnce(() => {
      throw new Error('A quote request is required before starting a subscription.');
    });
    fixture.detectChanges();

    expect(() => fixture.componentInstance.continueWithSubscription()).not.toThrow();
    fixture.detectChanges();

    expect(actionButton().disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.acceptance.errors.subscription,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps an unavailable offer unconfirmed and never starts a subscription', () => {
    confirmSelected.mockReturnValueOnce(throwError(() => new OfferUnavailableError()));

    acceptAndConfirm();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.acceptance.errors.unavailable,
    );
    expect(confirmedSelection()).toBeNull();
    expect(startSubscription).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows expired profile recovery instead of a generic subscription error', () => {
    confirmSelected.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'perfil_vencido' } })),
    );

    acceptAndConfirm();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.profiling.errors.expired,
    );
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/solicitar"]'),
    ).not.toBeNull();
    expect(startSubscription).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'perfil_vencido', status: 422, key: 'profiling.errors.expired' },
    { code: 'consentimiento_no_vigente', status: 403, key: 'profiling.errors.consent' },
  ])(
    'preserves terminal selection error $code after toggling acceptance',
    ({ code, status, key }) => {
      confirmSelected.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status, error: { code } })),
      );
      acceptAndConfirm();
      const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('mat-checkbox input');

      checkbox.click();
      fixture.detectChanges();
      checkbox.click();
      fixture.detectChanges();
      actionButton().click();
      fixture.componentInstance.confirm();

      expect(fixture.componentInstance.accepted()).toBe(true);
      expect(fixture.componentInstance.errorKey()).toBe(key);
      expect(actionButton().disabled).toBe(true);
      expect(confirmSelected).toHaveBeenCalledOnce();
      expect(startSubscription).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { code: 'perfil_vencido', status: 422, key: 'profiling.errors.expired' },
    { code: 'consentimiento_no_vigente', status: 403, key: 'profiling.errors.consent' },
  ])(
    'does not restart subscription after acceptance returns terminal $code',
    ({ code, status, key }) => {
      startSubscription.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status, error: { code } })),
      );
      acceptAndConfirm();

      actionButton().click();
      fixture.componentInstance.continueWithSubscription();
      fixture.detectChanges();

      expect(confirmedSelection()).toEqual(CONFIRMED_SELECTION);
      expect(fixture.componentInstance.errorKey()).toBe(key);
      expect(actionButton().disabled).toBe(true);
      expect(confirmSelected).toHaveBeenCalledOnce();
      expect(startSubscription).toHaveBeenCalledOnce();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    { code: 'perfil_vencido', status: 422, key: 'profiling.errors.expired' },
    { code: 'consentimiento_no_vigente', status: 403, key: 'profiling.errors.consent' },
  ])('does not retry restored subscription after terminal $code', ({ code, status, key }) => {
    confirmedSelection.set(CONFIRMED_SELECTION);
    startSubscription.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status, error: { code } })),
    );
    fixture.detectChanges();
    actionButton().click();
    fixture.detectChanges();

    actionButton().click();
    fixture.componentInstance.continueWithSubscription();

    expect(fixture.componentInstance.errorKey()).toBe(key);
    expect(actionButton().disabled).toBe(true);
    expect(confirmSelected).not.toHaveBeenCalled();
    expect(startSubscription).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('permits retrying a transient selection error after toggling acceptance', () => {
    confirmSelected.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    acceptAndConfirm();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('mat-checkbox input');

    checkbox.click();
    fixture.detectChanges();
    checkbox.click();
    fixture.detectChanges();
    expect(actionButton().disabled).toBe(false);
    actionButton().click();

    expect(confirmSelected).toHaveBeenCalledTimes(2);
    expect(startSubscription).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('shows an explicit load error instead of an endless acceptance spinner', () => {
    selectedOffer.set(null);
    offersStatus.set('error');
    offersError.set('profiling.errors.expired');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      es.profiling.errors.expired,
    );
    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/solicitar"]'),
    ).not.toBeNull();
  });

  it.each(['approved', 'review', 'rejected'] as const)(
    'continues to the real subscription status for a %s decision without changing it',
    (status) => {
      const subscription = {
        ...SUBSCRIPTION,
        status,
        decision: { ...SUBSCRIPTION.decision, result: status },
      };
      startSubscription.mockReturnValueOnce(of(subscription));

      acceptAndConfirm();

      expect(subscription.status).toBe(status);
      expect(subscription.saga.status).toBe('payment_pending');
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/app/cotizaciones/suscripcion']);
    },
  );

  it('uses consistent customer-facing continuation labels in Spanish and English', () => {
    expect(es.acceptance.continueAction).toBe('Proceder al pago');
    expect(en.acceptance.continueAction).toBe('Proceed to payment');
  });
});

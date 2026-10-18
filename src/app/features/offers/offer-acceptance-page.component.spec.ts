import { signal } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
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
  const confirmSelected = vi.fn(() => of(CONFIRMED_SELECTION));
  const startSubscription = vi.fn(() => of(SUBSCRIPTION));
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        OfferAcceptancePageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: OfferSelectionService,
          useValue: {
            selectedOffer: signal(OFFER),
            confirmedSelection: signal<SelectedOfferRecord | null>(null),
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

    confirmSelected.mockClear();
    startSubscription.mockClear();
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
});

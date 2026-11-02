import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent } from '../../core/profiling/profiling.fixtures';
import {
  InsuranceOffer,
  OfferCalculation,
  PremiumPeriodicity,
  SelectedOfferRecord,
} from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { OfferAcceptancePageComponent } from './offer-acceptance-page.component';
import { OfferSelectionPageComponent } from './offer-selection-page.component';

const CASES: { periodicity: PremiumPeriodicity; label: string }[] = [
  { periodicity: 'mensual', label: 'Prima mensual' },
  { periodicity: 'por_viaje', label: 'Prima por viaje' },
  { periodicity: 'por_vuelo', label: 'Prima por vuelo' },
  { periodicity: 'por_periodo', label: 'Prima por periodo' },
];

async function configurePage(periodicity: PremiumPeriodicity): Promise<void> {
  const offer: InsuranceOffer = {
    id: 'offer-001',
    version: 1,
    name: 'Plan Integral',
    description: 'Protección integral',
    premium: { amount: 48_000, currency: 'COP' },
    periodicity,
    coverageLabel: 'Cobertura principal',
    deductibleLabel: 'Sin deducible',
    validityLabel: 'Vigencia del plan',
    liabilityLabel: 'Según el plan',
    coverages: [],
    conditions: [],
    additionalBenefits: ['Asistencia adicional del plan'],
    recommended: true,
    status: 'available',
    validUntil: '2030-01-01T00:00:00Z',
  };
  const selection: SelectedOfferRecord = {
    quoteId: 'quote-001',
    offerId: offer.id,
    offerVersion: offer.version,
    offerName: offer.name,
    premium: offer.premium,
    periodicity,
    selectedAt: '2026-10-17T00:00:00Z',
    confirmed: true,
  };
  const calculation: OfferCalculation = {
    quoteId: selection.quoteId,
    calculatedAt: selection.selectedAt,
    validUntil: offer.validUntil,
    appliedRate: 'Riesgo A',
    offers: [offer],
  };
  const service: Pick<
    OfferSelectionService,
    | 'load'
    | 'status'
    | 'calculation'
    | 'availableOffers'
    | 'selectedOfferId'
    | 'expandedOfferId'
    | 'selectedOffer'
    | 'canContinue'
    | 'isSelectable'
    | 'confirmedSelection'
    | 'selectOffer'
    | 'toggleDetails'
    | 'confirmSelected'
  > = {
    load: vi.fn(),
    status: signal('ready'),
    calculation: signal(calculation),
    availableOffers: signal([offer]),
    selectedOfferId: signal(offer.id),
    expandedOfferId: signal(null),
    selectedOffer: signal(offer),
    canContinue: signal(true),
    isSelectable: () => true,
    confirmedSelection: signal(selection),
    selectOffer: vi.fn(() => true),
    toggleDetails: vi.fn(),
    confirmSelected: () => of(selection),
  };

  await TestBed.configureTestingModule({
    imports: [
      OfferSelectionPageComponent,
      OfferAcceptancePageComponent,
      TranslocoTestingModule.forRoot({
        langs: {
          es: {
            offers: {
              premiumLabels: {
                mensual: 'Prima mensual',
                por_viaje: 'Prima por viaje',
                por_vuelo: 'Prima por vuelo',
                por_periodo: 'Prima por periodo',
              },
            },
          },
        },
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
      }),
    ],
    providers: [
      provideRouter([]),
      { provide: OfferSelectionService, useValue: service },
      { provide: AuthService, useValue: { user: signal(null) } },
      {
        provide: QuoteRequestService,
        useValue: {
          latestRequest: signal(null),
          products: signal([]),
          travelDestinations: signal([]),
          loadProducts: vi.fn(),
          loadTravelDestinations: vi.fn(),
        },
      },
      { provide: SubscriptionService, useValue: { start: vi.fn() } },
      { provide: PROFILING_GATEWAY, useValue: { loadConsent: () => of(createConsent()) } },
    ],
  }).compileComponents();
}

describe('Importe y periodicidad visibles', () => {
  beforeAll(() => registerLocaleData(localeEsCo));

  it.each(CASES)(
    'muestra $label en las ofertas sin convertir el importe',
    async ({ periodicity, label }) => {
      await configurePage(periodicity);
      const fixture = TestBed.createComponent(OfferSelectionPageComponent);
      fixture.detectChanges();

      const price = fixture.nativeElement.querySelector('.plan-price');
      expect(price.textContent).toContain(label);
      expect(price.querySelector('strong').textContent.replace(/\s+/g, '')).toBe('$48.000');
      expect(fixture.nativeElement.querySelector('.plan-benefits').textContent).toContain(
        'Asistencia adicional del plan',
      );
      if (periodicity !== 'mensual') {
        expect(price.textContent).not.toContain('Prima mensual');
      }
    },
  );

  it.each(CASES)(
    'conserva $label en el resumen de la selección',
    async ({ periodicity, label }) => {
      await configurePage(periodicity);
      const fixture = TestBed.createComponent(OfferAcceptancePageComponent);
      fixture.detectChanges();

      const summary = fixture.nativeElement.querySelector('.premium');
      expect(summary.textContent).toContain(label);
      expect(summary.textContent.replace(/\s+/g, '')).toContain('$48.000');
      if (periodicity !== 'mensual') {
        expect(summary.textContent).not.toContain('Prima mensual');
      }
    },
  );
});

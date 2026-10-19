import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { DASHBOARD_GATEWAY } from '../../core/dashboard/dashboard.gateway';
import { DASHBOARD_SNAPSHOT, EMPTY_DASHBOARD } from '../../core/dashboard/dashboard.testing';
import { DashboardSnapshot } from '../../core/dashboard/dashboard.models';
import {
  OFFER_SELECTION_STORAGE,
  OfferSelectionStorage,
} from '../../core/offers/offer-selection-storage.service';
import {
  QUOTE_REQUEST_GATEWAY,
  QuoteRequestGateway,
} from '../../core/quotes/quote-request.gateway';
import {
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
  QuoteProductData,
  TravelDestination,
} from '../../core/quotes/quote-request.models';
import {
  QUOTE_REQUEST_STORAGE,
  QuoteRequestStorage,
} from '../../core/quotes/quote-request-storage.service';
import { QuoteSummaryPageComponent } from './quote-summary-page.component';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';

const RECORD: QuoteRequestRecord = {
  id: 'AQT-2026-123456',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
  productId: 'automotive',
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '12345678-9',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@solventa.co',
  phone: '+573001234567',
};

class TestQuoteRequestGateway implements QuoteRequestGateway {
  loadRequest(id: string): Observable<QuoteRequestRecord> {
    return of({ ...RECORD, id });
  }
  loadProducts(): Observable<InsuranceProduct[]> {
    return of([
      {
        id: 'automotive',
        name: 'Seguro Automotriz Total',
        description: 'Protección para el vehículo',
        available: true,
      },
    ]);
  }

  loadTravelDestinations(): Observable<TravelDestination[]> {
    return of([{ code: 'CO', name: 'Colombia' }]);
  }

  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    return of({ ...request, ...RECORD });
  }
}

class TestQuoteRequestStorage implements QuoteRequestStorage {
  request: QuoteRequestRecord | null = RECORD;

  read(): QuoteRequestRecord | null {
    return this.request;
  }

  write(request: QuoteRequestRecord): void {
    this.request = request;
  }

  clear(): void {
    this.request = null;
  }
}

class TestOfferSelectionStorage implements OfferSelectionStorage {
  read(): null {
    return null;
  }
  write(): void {}
  clear(): void {}
}

describe('QuoteSummaryPageComponent', () => {
  let fixture: ComponentFixture<QuoteSummaryPageComponent>;
  let storage: TestQuoteRequestStorage;
  let snapshot: DashboardSnapshot;
  const dashboard = { load: vi.fn() };

  beforeEach(async () => {
    snapshot = {
      ...DASHBOARD_SNAPSHOT,
      quotes: DASHBOARD_SNAPSHOT.quotes.map((quote) => ({ ...quote, requestId: RECORD.id })),
      subscriptions: DASHBOARD_SNAPSHOT.subscriptions.map((subscription) => ({
        ...subscription,
        requestId: RECORD.id,
        validUntil: '2099-01-01T00:00:00Z',
      })),
    };
    dashboard.load.mockReset().mockImplementation(() => of(snapshot));
    await TestBed.configureTestingModule({
      imports: [
        QuoteSummaryPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: DASHBOARD_GATEWAY, useValue: dashboard },
        { provide: QUOTE_REQUEST_GATEWAY, useClass: TestQuoteRequestGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
        {
          provide: PROFILING_GATEWAY,
          useValue: {
            loadConsent: () => of(createConsent()),
            loadProfile: () => of(createProfile(RECORD.id)),
          },
        },
      ],
    }).compileComponents();

    storage = TestBed.inject(QUOTE_REQUEST_STORAGE) as TestQuoteRequestStorage;
  });

  it('loads persisted quotes and links paid requests to subscription details without profiling', () => {
    storage.request = null;
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('AQT-2026-123456');
    expect(fixture.nativeElement.textContent).toContain('Seguro Automotriz Total');
    expect(
      fixture.nativeElement.querySelector(
        `a[href="/app/cotizaciones/suscripcion/detalle?solicitud=${RECORD.id}"]`,
      ),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Activa');
    expect(fixture.nativeElement.querySelector('app-profiling-panel')).toBeNull();
  });

  it('shows an empty state before the first quote request', () => {
    storage.request = null;
    snapshot = EMPTY_DASHBOARD;
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.cards()).toEqual([]);
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/solicitar"]'),
    ).not.toBeNull();
  });

  it.each<QuoteProductData>([{ coverageType: 'missed-connection' }, { weatherEvent: 'drought' }])(
    'traduce los valores de cobertura sin mostrar códigos al cliente',
    (productData) => {
      fixture = TestBed.createComponent(QuoteSummaryPageComponent);
      fixture.detectChanges();
      const detail = fixture.componentInstance.productDetails({ ...RECORD, productData })[0];
      expect(detail.valueKey).toBe(
        'coverageType' in productData
          ? 'quoteRequest.flightCoverages.missed-connection'
          : 'quoteRequest.weatherEvents.drought',
      );
    },
  );

  it('renders every quote separately with its own state and next step', () => {
    snapshot = {
      ...snapshot,
      quotes: [
        ...snapshot.quotes,
        { ...snapshot.quotes[0], id: 'quote-pending', requestId: 'pending', selection: null },
        { ...snapshot.quotes[0], id: 'quote-selected', requestId: 'selected' },
        { ...snapshot.quotes[0], id: 'quote-expired', requestId: 'expired' },
        { ...snapshot.quotes[0], id: 'quote-payment', requestId: 'payment' },
      ],
      subscriptions: [
        ...snapshot.subscriptions,
        {
          ...snapshot.subscriptions[0],
          id: 'expired-sub',
          requestId: 'expired',
          validUntil: '2000-01-01T00:00:00Z',
        },
        {
          ...snapshot.subscriptions[0],
          id: 'pending-sub',
          requestId: 'payment',
          saga: { ...snapshot.subscriptions[0].saga, status: 'pago_pendiente' },
        },
      ],
    };
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();
    const cards: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.summary-card'),
    );
    expect(cards).toHaveLength(5);
    expect(cards[0].textContent).toContain('Activa');
    expect(cards[1].textContent).toContain('Solicitud en proceso');
    expect(cards[1].querySelector('a')?.getAttribute('href')).toContain(
      '/ofertas?solicitud=pending',
    );
    expect(cards[2].textContent).toContain('Continuar aceptación');
    expect(cards[3].textContent).toContain('Vencida');
    expect(cards[4].textContent).toContain('Proceder al pago');
    expect(cards[4].querySelector('a')?.getAttribute('href')).toContain(
      '/suscripcion?solicitud=payment',
    );
  });

  it('shows an explicit retry if persisted history fails instead of displaying a cached last quote', () => {
    dashboard.load.mockReturnValueOnce(throwError(() => new Error('offline')));
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.summary-card')).toBeNull();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.summary-card')).not.toBeNull();
  });
});

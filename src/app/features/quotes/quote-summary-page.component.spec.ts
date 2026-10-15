import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
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
  TravelDestination,
} from '../../core/quotes/quote-request.models';
import {
  QUOTE_REQUEST_STORAGE,
  QuoteRequestStorage,
} from '../../core/quotes/quote-request-storage.service';
import { QuoteSummaryPageComponent } from './quote-summary-page.component';

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        QuoteSummaryPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: QUOTE_REQUEST_GATEWAY, useClass: TestQuoteRequestGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
      ],
    }).compileComponents();

    storage = TestBed.inject(QUOTE_REQUEST_STORAGE) as TestQuoteRequestStorage;
  });

  it('shows the current quote and links to its offers', () => {
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('AQT-2026-123456');
    expect(fixture.nativeElement.textContent).toContain('Seguro Automotriz Total');
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/ofertas"]'),
    ).not.toBeNull();
  });

  it('shows an empty state before the first quote request', () => {
    storage.request = null;
    fixture = TestBed.createComponent(QuoteSummaryPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.request()).toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/solicitar"]'),
    ).not.toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, Subject } from 'rxjs';
import {
  OFFER_SELECTION_STORAGE,
  OfferSelectionStorage,
} from '../offers/offer-selection-storage.service';
import { QUOTE_REQUEST_GATEWAY, QuoteRequestGateway } from './quote-request.gateway';
import { InsuranceProduct, QuoteRequestDraft, QuoteRequestRecord } from './quote-request.models';
import { QuoteRequestService } from './quote-request.service';
import { QUOTE_REQUEST_STORAGE, QuoteRequestStorage } from './quote-request-storage.service';

const PRODUCTS: InsuranceProduct[] = [
  {
    id: 'automotive',
    name: 'Seguro Automotriz Total',
    description: 'Protección para el vehículo',
    available: true,
  },
  {
    id: 'life',
    name: 'Seguro de Vida',
    description: 'Próximamente',
    available: false,
  },
];

const DRAFT: QuoteRequestDraft = {
  productId: 'automotive',
  customerType: 'natural',
  nationalId: '12345678-9',
  vehiclePlate: 'ABC123',
  email: 'cliente@solventa.co',
  phone: '912345678',
};

const RECORD: QuoteRequestRecord = {
  ...DRAFT,
  id: 'AQT-2026-123456',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
};

class TestQuoteRequestGateway implements QuoteRequestGateway {
  loadCalls = 0;
  productsResponse: Observable<InsuranceProduct[]> = of(PRODUCTS);
  requestResponse: Observable<QuoteRequestRecord> = of(RECORD);

  loadProducts(): Observable<InsuranceProduct[]> {
    this.loadCalls++;
    return this.productsResponse;
  }

  submitRequest(): Observable<QuoteRequestRecord> {
    return this.requestResponse;
  }
}

class TestQuoteRequestStorage implements QuoteRequestStorage {
  request: QuoteRequestRecord | null = null;

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
  clearCalls = 0;

  read(): null {
    return null;
  }

  write(): void {}

  clear(): void {
    this.clearCalls++;
  }
}

describe('QuoteRequestService', () => {
  let service: QuoteRequestService;
  let gateway: TestQuoteRequestGateway;
  let requestStorage: TestQuoteRequestStorage;
  let offerStorage: TestOfferSelectionStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QuoteRequestService,
        { provide: QUOTE_REQUEST_GATEWAY, useClass: TestQuoteRequestGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
      ],
    });

    service = TestBed.inject(QuoteRequestService);
    gateway = TestBed.inject(QUOTE_REQUEST_GATEWAY) as TestQuoteRequestGateway;
    requestStorage = TestBed.inject(QUOTE_REQUEST_STORAGE) as TestQuoteRequestStorage;
    offerStorage = TestBed.inject(OFFER_SELECTION_STORAGE) as TestOfferSelectionStorage;
  });

  it('loads the product catalog and exposes available products', () => {
    service.loadProducts();

    expect(service.catalogStatus()).toBe('ready');
    expect(service.products()).toEqual(PRODUCTS);
    expect(service.availableProducts()).toEqual([PRODUCTS[0]]);
  });

  it('prevents duplicate catalog loads while one is pending', () => {
    gateway.productsResponse = new Subject<InsuranceProduct[]>();

    service.loadProducts();
    service.loadProducts();

    expect(gateway.loadCalls).toBe(1);
    expect(service.catalogStatus()).toBe('loading');
  });

  it('registers and persists a successful request', async () => {
    const result = await firstValueFrom(service.submit(DRAFT));

    expect(result.id).toBe('AQT-2026-123456');
    expect(requestStorage.request).toEqual(RECORD);
    expect(service.latestRequest()).toEqual(RECORD);
  });

  it('clears a previous offer selection after a new request', async () => {
    await firstValueFrom(service.submit(DRAFT));

    expect(offerStorage.clearCalls).toBe(1);
  });
});

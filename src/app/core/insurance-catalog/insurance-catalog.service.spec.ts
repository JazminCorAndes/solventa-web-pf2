import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { INSURANCE_CATALOG_GATEWAY, InsuranceCatalogGateway } from './insurance-catalog.gateway';
import { InsuranceProductDetail, InsuranceProductSummary } from './insurance-catalog.models';
import { InsuranceCatalogService } from './insurance-catalog.service';

const SUMMARY: InsuranceProductSummary = {
  id: 'travel',
  name: 'Seguro de Viaje',
  description: 'Protección durante el viaje',
  available: true,
  mainCoverages: ['Asistencia médica'],
};

const DETAIL: InsuranceProductDetail = {
  ...SUMMARY,
  coverages: [
    {
      name: 'Asistencia médica',
      description: 'Atención por enfermedad o accidente.',
    },
  ],
  conditions: ['Válido durante las fechas declaradas.'],
  relevantInformation: {
    insuredAmount: 200000000,
    deductible: 200000,
    currency: 'COP',
    term: 'Por la duración del viaje',
  },
};

class TestInsuranceCatalogGateway implements InsuranceCatalogGateway {
  productsResponse: Observable<InsuranceProductSummary[]> = of([SUMMARY]);
  productResponse: Observable<InsuranceProductDetail | null> = of(DETAIL);

  loadProducts(): Observable<InsuranceProductSummary[]> {
    return this.productsResponse;
  }

  loadProduct(): Observable<InsuranceProductDetail | null> {
    return this.productResponse;
  }
}

describe('InsuranceCatalogService', () => {
  let service: InsuranceCatalogService;
  let gateway: TestInsuranceCatalogGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InsuranceCatalogService,
        { provide: INSURANCE_CATALOG_GATEWAY, useClass: TestInsuranceCatalogGateway },
      ],
    });
    service = TestBed.inject(InsuranceCatalogService);
    gateway = TestBed.inject(INSURANCE_CATALOG_GATEWAY) as TestInsuranceCatalogGateway;
  });

  it('exposes the available products', () => {
    service.loadProducts();

    expect(service.catalogStatus()).toBe('ready');
    expect(service.products()).toEqual([SUMMARY]);
  });

  it('shows an empty state for an empty response', () => {
    gateway.productsResponse = of([]);

    service.loadProducts();

    expect(service.catalogStatus()).toBe('empty');
    expect(service.products()).toEqual([]);
  });

  it('clears previous products when a refresh fails', () => {
    service.loadProducts();
    gateway.productsResponse = throwError(() => new Error('unavailable'));

    service.loadProducts();

    expect(service.catalogStatus()).toBe('error');
    expect(service.products()).toEqual([]);
  });

  it('loads the selected product detail', () => {
    service.loadProduct('travel');

    expect(service.detailStatus()).toBe('ready');
    expect(service.selectedProduct()).toEqual(DETAIL);
  });

  it('shows not found and clears stale detail', () => {
    service.loadProduct('travel');
    gateway.productResponse = of(null);

    service.loadProduct('unknown');

    expect(service.detailStatus()).toBe('not-found');
    expect(service.selectedProduct()).toBeNull();
  });
});

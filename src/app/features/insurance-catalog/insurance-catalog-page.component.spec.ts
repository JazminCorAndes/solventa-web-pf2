import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import {
  INSURANCE_CATALOG_GATEWAY,
  InsuranceCatalogGateway,
} from '../../core/insurance-catalog/insurance-catalog.gateway';
import {
  InsuranceProductDetail,
  InsuranceProductSummary,
} from '../../core/insurance-catalog/insurance-catalog.models';
import { InsuranceCatalogPageComponent } from './insurance-catalog-page.component';

const PRODUCT: InsuranceProductSummary = {
  id: 'travel',
  name: 'Seguro de Viaje',
  description: 'Protección durante el viaje',
  available: true,
  mainCoverages: ['Asistencia médica'],
};

class TestInsuranceCatalogGateway implements InsuranceCatalogGateway {
  response: Observable<InsuranceProductSummary[]> = of([PRODUCT]);

  loadProducts(): Observable<InsuranceProductSummary[]> {
    return this.response;
  }

  loadProduct(): Observable<InsuranceProductDetail | null> {
    return of(null);
  }
}

describe('InsuranceCatalogPageComponent', () => {
  let fixture: ComponentFixture<InsuranceCatalogPageComponent>;
  let gateway: TestInsuranceCatalogGateway;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        InsuranceCatalogPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: INSURANCE_CATALOG_GATEWAY, useClass: TestInsuranceCatalogGateway },
      ],
    }).compileComponents();
    gateway = TestBed.inject(INSURANCE_CATALOG_GATEWAY) as TestInsuranceCatalogGateway;
  });

  it('renders products and their own main coverages', () => {
    fixture = TestBed.createComponent(InsuranceCatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Seguro de Viaje');
    expect(fixture.nativeElement.textContent).toContain('Asistencia médica');
    expect(
      fixture.nativeElement.querySelector('a[href="/app/seguros/travel?origen=travel"]'),
    ).not.toBeNull();
  });

  it('renders the empty state without stale product cards', () => {
    gateway.response = of([]);
    fixture = TestBed.createComponent(InsuranceCatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.catalog.catalogStatus()).toBe('empty');
    expect(fixture.nativeElement.querySelector('.product-card')).toBeNull();
  });

  it('offers a retry after an error', () => {
    gateway.response = throwError(() => new Error('unavailable'));
    fixture = TestBed.createComponent(InsuranceCatalogPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.catalog.catalogStatus()).toBe('error');
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });
});

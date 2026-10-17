import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import {
  INSURANCE_CATALOG_GATEWAY,
  InsuranceCatalogGateway,
} from '../../core/insurance-catalog/insurance-catalog.gateway';
import {
  InsuranceProductDetail,
  InsuranceProductSummary,
} from '../../core/insurance-catalog/insurance-catalog.models';
import { InsuranceProductDetailPageComponent } from './insurance-product-detail-page.component';

const PRODUCT: InsuranceProductDetail = {
  id: 'travel',
  name: 'Seguro de Viaje',
  description: 'Protección durante el viaje',
  available: true,
  mainCoverages: ['Asistencia médica'],
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
  response: Observable<InsuranceProductDetail | null> = of(PRODUCT);

  loadProducts(): Observable<InsuranceProductSummary[]> {
    return of([]);
  }

  loadProduct(): Observable<InsuranceProductDetail | null> {
    return this.response;
  }
}

describe('InsuranceProductDetailPageComponent', () => {
  let fixture: ComponentFixture<InsuranceProductDetailPageComponent>;
  let gateway: TestInsuranceCatalogGateway;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        InsuranceProductDetailPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ productoId: 'travel' }),
            },
          },
        },
        { provide: INSURANCE_CATALOG_GATEWAY, useClass: TestInsuranceCatalogGateway },
      ],
    }).compileComponents();
    gateway = TestBed.inject(INSURANCE_CATALOG_GATEWAY) as TestInsuranceCatalogGateway;
  });

  it('renders only the selected product information and navigation context', () => {
    fixture = TestBed.createComponent(InsuranceProductDetailPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Seguro de Viaje');
    expect(fixture.nativeElement.textContent).toContain('Asistencia médica');
    expect(
      fixture.nativeElement.querySelector('a[href="/app/seguros?seleccion=travel"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('a[href="/app/cotizaciones/solicitar?producto=travel"]'),
    ).not.toBeNull();
  });

  it('shows the not-found state without stale product information', () => {
    gateway.response = of(null);
    fixture = TestBed.createComponent(InsuranceProductDetailPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.catalog.detailStatus()).toBe('not-found');
    expect(fixture.nativeElement.textContent).not.toContain('Seguro de Viaje');
  });

  it('shows unavailable product details but blocks requesting a quote', () => {
    gateway.response = of({ ...PRODUCT, available: false });
    fixture = TestBed.createComponent(InsuranceProductDetailPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Asistencia médica');
    expect(fixture.nativeElement.querySelector('.quote-action a')).toBeNull();
    expect(fixture.nativeElement.querySelector('.quote-action button').disabled).toBe(true);
  });
});

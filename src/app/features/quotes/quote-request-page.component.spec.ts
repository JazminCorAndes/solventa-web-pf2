import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  OFFER_SELECTION_STORAGE,
  OfferSelectionStorage,
} from '../../core/offers/offer-selection-storage.service';
import { QuoteRequestUnavailableError } from '../../core/quotes/quote-request.errors';
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
import { QuoteRequestPageComponent } from './quote-request-page.component';

const PRODUCT: InsuranceProduct = {
  id: 'automotive',
  name: 'Seguro Automotriz Total',
  description: 'Protección para el vehículo',
  available: true,
};

const TRAVEL_PRODUCT: InsuranceProduct = {
  id: 'travel',
  name: 'Seguro de Viaje',
  description: 'Protección para viajes',
  available: true,
};

const RECORD: QuoteRequestRecord = {
  id: 'AQT-2026-123456',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
  productId: PRODUCT.id,
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '1234567890',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@solventa.co',
  phone: '+573001234567',
};

class TestQuoteRequestGateway implements QuoteRequestGateway {
  submitCalls = 0;
  lastRequest: QuoteRequestDraft | null = null;
  response: Observable<QuoteRequestRecord> = of(RECORD);

  loadProducts(): Observable<InsuranceProduct[]> {
    return of([PRODUCT, TRAVEL_PRODUCT]);
  }

  loadTravelDestinations(): Observable<TravelDestination[]> {
    return of([
      { code: 'CO', name: 'Colombia' },
      { code: 'PE', name: 'Perú' },
    ]);
  }

  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    this.submitCalls++;
    this.lastRequest = request;
    return this.response;
  }
}

class TestQuoteRequestStorage implements QuoteRequestStorage {
  read(): null {
    return null;
  }
  write(): void {}
  clear(): void {}
}

class TestOfferSelectionStorage implements OfferSelectionStorage {
  read(): null {
    return null;
  }
  write(): void {}
  clear(): void {}
}

describe('QuoteRequestPageComponent', () => {
  let fixture: ComponentFixture<QuoteRequestPageComponent>;
  let component: QuoteRequestPageComponent;
  let gateway: TestQuoteRequestGateway;
  let router: Router;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        QuoteRequestPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: () => ({
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
        { provide: QUOTE_REQUEST_GATEWAY, useClass: TestQuoteRequestGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteRequestPageComponent);
    component = fixture.componentInstance;
    gateway = TestBed.inject(QUOTE_REQUEST_GATEWAY) as TestQuoteRequestGateway;
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('does not send an invalid request', () => {
    component.submit();

    expect(gateway.submitCalls).toBe(0);
    expect(component.attempted()).toBe(true);
    expect(component.form.controls.productId.touched).toBe(true);
  });

  it('rejects invalid product field formats', () => {
    component.form.patchValue({
      productId: PRODUCT.id,
      vehiclePlate: '*',
    });

    component.submit();

    expect(gateway.submitCalls).toBe(0);
    expect(component.form.controls.vehiclePlate.invalid).toBe(true);
  });

  it('shows profile data instead of requesting it again', () => {
    expect(fixture.nativeElement.textContent).toContain('cliente@solventa.co');
    expect(fixture.nativeElement.textContent).toContain('1023456789');
    expect(fixture.nativeElement.querySelector('#national-id')).toBeNull();
    expect(fixture.nativeElement.querySelector('#quote-phone')).toBeNull();
  });

  it('removes characters that are not accepted by a Colombian plate', () => {
    component.form.controls.productId.setValue(PRODUCT.id);
    fixture.detectChanges();
    const vehiclePlate = fixture.nativeElement.querySelector('#vehicle-plate') as HTMLInputElement;

    enterValue(vehiclePlate, 'ab-cD123');

    expect(component.form.controls.vehiclePlate.value).toBe('ABC123');
  });

  it('prevents duplicate submissions while the request is pending', () => {
    gateway.response = new Subject<QuoteRequestRecord>();
    fillValidForm(component);

    component.submit();
    component.submit();
    fixture.detectChanges();

    expect(gateway.submitCalls).toBe(1);
    expect(component.submitting()).toBe(true);
    expect(fixture.nativeElement.querySelector('.quote-processing-overlay')).not.toBeNull();
  });

  it('navigates to the offers after a successful request', () => {
    fillValidForm(component);

    component.submit();

    expect(component.submittedRequest()?.id).toBe('AQT-2026-123456');
    expect(component.form.disabled).toBe(true);
    expect(gateway.lastRequest).toEqual({
      productId: PRODUCT.id,
      productData: { vehiclePlate: 'ABC123' },
    });
    expect(navigate).toHaveBeenCalledWith(['/app/cotizaciones/ofertas']);
  });

  it('submits the specific data required by travel insurance', () => {
    component.form.patchValue({
      productId: TRAVEL_PRODUCT.id,
      destination: { code: 'PE', name: 'Perú' },
      departureDate: new Date(2026, 10, 1),
      returnDate: new Date(2026, 10, 10),
    });

    component.submit();

    expect(gateway.lastRequest?.productData).toEqual({
      destinationCountryCode: 'PE',
      departureDate: '2026-11-01',
      returnDate: '2026-11-10',
    });
  });

  it('rejects a destination that was not selected from the catalog', () => {
    component.form.patchValue({
      productId: TRAVEL_PRODUCT.id,
      destination: 'País inventado',
      departureDate: new Date(2026, 10, 1),
      returnDate: new Date(2026, 10, 10),
    });

    component.submit();

    expect(gateway.submitCalls).toBe(0);
    expect(component.form.controls.destination.invalid).toBe(true);
  });

  it('shows a retryable message when the service is unavailable', () => {
    gateway.response = throwError(() => new QuoteRequestUnavailableError());
    fillValidForm(component);

    component.submit();
    fixture.detectChanges();

    expect(component.errorKey()).toBe('quoteRequest.errors.unavailable');
    expect(component.form.enabled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.quote-processing-overlay')).toBeNull();
  });
});

function fillValidForm(component: QuoteRequestPageComponent): void {
  const draft: QuoteRequestDraft = {
    productId: PRODUCT.id,
    productData: { vehiclePlate: 'abc123' },
  };
  component.form.patchValue({
    productId: draft.productId,
    vehiclePlate: draft.productData['vehiclePlate'],
  });
}

function enterValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

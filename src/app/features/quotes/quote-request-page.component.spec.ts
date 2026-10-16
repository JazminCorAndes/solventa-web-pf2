import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
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
} from '../../core/quotes/quote-request.models';
import {
  QUOTE_REQUEST_STORAGE,
  QuoteRequestStorage,
} from '../../core/quotes/quote-request-storage.service';
import { QuoteRequestPageComponent } from './quote-request-page.component';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { environment } from '../../../environments/environment';

const PRODUCT: InsuranceProduct = {
  id: 'automotive',
  name: 'Seguro Automotriz Total',
  description: 'Protección para el vehículo',
  available: true,
};

const RECORD: QuoteRequestRecord = {
  id: 'AQT-2026-123456',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
  productId: PRODUCT.id,
  customerType: 'natural',
  nationalId: '12345678-9',
  vehiclePlate: 'ABC123',
  email: 'cliente@solventa.co',
  phone: '912345678',
};

class TestQuoteRequestGateway implements QuoteRequestGateway {
  submitCalls = 0;
  lastRequest: QuoteRequestDraft | null = null;
  response: Observable<QuoteRequestRecord> = of(RECORD);

  loadProducts(): Observable<InsuranceProduct[]> {
    return of([PRODUCT]);
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
  const originalMode = environment.dataAccessMode;
  let fixture: ComponentFixture<QuoteRequestPageComponent>;
  let component: QuoteRequestPageComponent;
  let gateway: TestQuoteRequestGateway;

  beforeEach(async () => {
    environment.dataAccessMode = 'mock';
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
        { provide: QUOTE_REQUEST_GATEWAY, useClass: TestQuoteRequestGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
        {
          provide: PROFILING_GATEWAY,
          useValue: {
            loadConsent: () => of(createConsent()),
            loadProfile: (id: string) => of(createProfile(id)),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuoteRequestPageComponent);
    component = fixture.componentInstance;
    gateway = TestBed.inject(QUOTE_REQUEST_GATEWAY) as TestQuoteRequestGateway;
    fixture.detectChanges();
  });

  afterEach(() => {
    environment.dataAccessMode = originalMode;
  });

  it('usa identidad de sesion sin pedir documento o contacto en modo backend', () => {
    fixture.destroy();
    environment.dataAccessMode = 'backend';
    fixture = TestBed.createComponent(QuoteRequestPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.form.patchValue({ productId: PRODUCT.id, vehiclePlate: 'ABC123' });
    component.submit();
    expect(gateway.submitCalls).toBe(1);
    expect(fixture.nativeElement.querySelector('#national-id')).toBeNull();
    expect(fixture.nativeElement.querySelector('#quote-email')).toBeNull();
    expect(fixture.nativeElement.querySelector('#quote-phone')).toBeNull();
  });

  it('does not send an invalid request', () => {
    component.submit();

    expect(gateway.submitCalls).toBe(0);
    expect(component.attempted()).toBe(true);
    expect(component.form.controls.email.touched).toBe(true);
  });

  it('rejects invalid field formats', () => {
    component.form.setValue({
      productId: PRODUCT.id,
      customerType: 'natural',
      nationalId: '1',
      vehiclePlate: '*',
      email: 'correo-invalido',
      phone: '123',
    });

    component.submit();

    expect(gateway.submitCalls).toBe(0);
    expect(component.form.controls.nationalId.invalid).toBe(true);
    expect(component.form.controls.vehiclePlate.invalid).toBe(true);
    expect(component.form.controls.email.invalid).toBe(true);
    expect(component.form.controls.phone.invalid).toBe(true);
  });

  it('prevents duplicate submissions while the request is pending', () => {
    gateway.response = new Subject<QuoteRequestRecord>();
    fillValidForm(component);

    component.submit();
    component.submit();

    expect(gateway.submitCalls).toBe(1);
    expect(component.submitting()).toBe(true);
  });

  it('no envia una solicitud sin consentimiento vigente', () => {
    fillValidForm(component);
    component.profilingReady.set(false);
    component.submit();
    expect(gateway.submitCalls).toBe(0);
    expect(component.errorKey()).toBe('profiling.errors.consent');
  });

  it('shows the generated identifier after a successful request', () => {
    fillValidForm(component);

    component.submit();

    expect(component.submittedRequest()?.id).toBe('AQT-2026-123456');
    expect(component.form.disabled).toBe(true);
    expect(gateway.lastRequest).toMatchObject({
      vehiclePlate: 'ABC123',
      email: 'cliente@solventa.co',
      phone: '+56912345678',
    });
  });

  it('shows a retryable message when the service is unavailable', () => {
    gateway.response = throwError(() => new QuoteRequestUnavailableError());
    fillValidForm(component);

    component.submit();

    expect(component.errorKey()).toBe('quoteRequest.errors.unavailable');
    expect(component.form.enabled).toBe(true);
  });
});

function fillValidForm(component: QuoteRequestPageComponent): void {
  const draft: QuoteRequestDraft = {
    productId: PRODUCT.id,
    customerType: 'natural',
    nationalId: '12.345.678-9',
    vehiclePlate: 'abc123',
    email: 'CLIENTE@SOLVENTA.CO',
    phone: '912 345 678',
  };
  component.form.setValue(draft);
}

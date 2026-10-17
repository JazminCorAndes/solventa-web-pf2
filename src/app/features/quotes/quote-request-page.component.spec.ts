import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/auth/auth.models';
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

const OTHER_PRODUCTS = [
  'life',
  'device-protection',
  'parametric',
  'parametric-weather',
  'payment-protection',
  'mortgage-life',
].map((id): InsuranceProduct => ({ id, name: id, description: id, available: true }));

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
    return of([PRODUCT, TRAVEL_PRODUCT, ...OTHER_PRODUCTS]);
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
  let user: WritableSignal<AuthUser | null>;

  beforeEach(async () => {
    user = signal<AuthUser | null>({
      id: 'client-001',
      name: 'Natalia Córdoba',
      email: 'cliente@solventa.co',
      role: 'client',
      documentType: 'cc',
      nationalId: '1023456789',
      phone: '+573001234567',
    });

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
          useValue: { user },
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

  it('preselects the catalog product while retaining its risk-field validation', () => {
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockReturnValue(
      'parametric-weather',
    );
    const catalogFixture = TestBed.createComponent(QuoteRequestPageComponent);
    catalogFixture.detectChanges();
    const catalogComponent = catalogFixture.componentInstance;

    expect(catalogComponent.selectedProduct()?.id).toBe('parametric-weather');
    expect(catalogComponent.form.controls.location.hasError('required')).toBe(true);
    expect(catalogComponent.form.controls.startDate.hasError('required')).toBe(true);
    expect(catalogComponent.form.controls.vehiclePlate.valid).toBe(true);
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

  it('shows a single unavailable label when the backend session has no identity details', () => {
    user.set({
      id: 'client-001',
      name: 'Natalia Córdoba',
      email: 'cliente@solventa.co',
      role: 'client',
    });
    fixture.detectChanges();

    const profileValues = fixture.nativeElement.querySelectorAll('.profile-summary dd');
    expect(profileValues[0].textContent.trim()).toBe('quoteRequest.profileUnavailable');
    expect(profileValues[1].textContent.trim()).toBe('cliente@solventa.co');
    expect(profileValues[2].textContent.trim()).toBe('quoteRequest.profileUnavailable');
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

  it.each([
    {
      productId: 'life',
      fields: { birthDate: new Date(1990, 0, 1) },
      data: { birthDate: '1990-01-01' },
    },
    {
      productId: 'device-protection',
      fields: { deviceType: 'Celular', brandModel: 'Marca Modelo', purchaseValue: '3000000' },
      data: { deviceType: 'Celular', brandModel: 'Marca Modelo', purchaseValue: '3000000' },
    },
    {
      productId: 'payment-protection',
      fields: { creditType: 'Consumo', monthlyPayment: '850000' },
      data: { creditType: 'Consumo', monthlyPayment: '850000' },
    },
    {
      productId: 'mortgage-life',
      fields: { birthDate: new Date(1990, 0, 1), mortgageBalance: '180000000' },
      data: { birthDate: '1990-01-01', mortgageBalance: '180000000' },
    },
  ])(
    'envía exclusivamente los datos de $productId sin exigir placa',
    ({ productId, fields, data }) => {
      component.form.patchValue({ productId, ...fields });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#vehicle-plate')).toBeNull();

      component.submit();

      expect(gateway.lastRequest).toEqual({ productId, productData: data });
    },
  );

  it.each(['delay-cancellation', 'missed-connection', 'comprehensive'])(
    'cotiza vuelos con cobertura %s',
    (coverageType) => {
      const flightDate = futureDay(10);
      component.form.patchValue({
        productId: 'parametric',
        airline: '  Avianca  ',
        flightNumber: 'av123',
        flightDate,
        coverageType,
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#flight-coverage')).not.toBeNull();

      component.submit();

      expect(gateway.lastRequest).toEqual({
        productId: 'parametric',
        productData: {
          airline: 'Avianca',
          flightNumber: 'AV123',
          flightDate: isoDate(flightDate),
          coverageType,
        },
      });
    },
  );

  it.each(['heavy-rain', 'drought'])(
    'cotiza clima para %s y muestra sus campos propios',
    (weatherEvent) => {
      fillWeatherForm(component);
      component.form.controls.weatherEvent.setValue(weatherEvent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('#weather-location')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#vehicle-plate')).toBeNull();
      expect(fixture.nativeElement.querySelector('#flight-number')).toBeNull();
      component.submit();

      expect(gateway.lastRequest).toEqual({
        productId: 'parametric-weather',
        productData: {
          location: 'Villavicencio, Meta',
          weatherEvent,
          startDate: isoDate(futureDay(10)),
          endDate: isoDate(futureDay(20)),
          insuredAmount: '10000000',
        },
      });
    },
  );

  it.each(['', '0', '-1', '1.5', '1000000001', 'abc'])(
    'rechaza un valor climático inválido: %s',
    (insuredAmount) => {
      fillWeatherForm(component);
      component.form.controls.insuredAmount.setValue(insuredAmount);
      component.submit();
      expect(gateway.submitCalls).toBe(0);
      expect(component.form.controls.insuredAmount.invalid).toBe(true);
    },
  );

  it.each(['1', '1000000000'])('acepta el límite asegurado %s COP', (insuredAmount) => {
    fillWeatherForm(component);
    component.form.controls.insuredAmount.setValue(insuredAmount);
    component.submit();
    expect(gateway.lastRequest?.productData['insuredAmount']).toBe(insuredAmount);
  });

  it.each([
    { start: 0, end: 10 },
    { start: -1, end: 10 },
    { start: 20, end: 10 },
    { start: 10, end: 376 },
  ])('rechaza un periodo climático inválido: $start a $end', ({ start, end }) => {
    fillWeatherForm(component);
    component.form.patchValue({ startDate: futureDay(start), endDate: futureDay(end) });
    component.submit();
    expect(gateway.submitCalls).toBe(0);
  });

  it('acepta un periodo de exactamente 366 días inclusive', () => {
    fillWeatherForm(component);
    component.form.controls.endDate.setValue(futureDay(375));
    component.submit();
    expect(gateway.submitCalls).toBe(1);
  });

  it.each(['', '   ', 'x'.repeat(121)])('rechaza una ubicación climática inválida', (location) => {
    fillWeatherForm(component);
    component.form.controls.location.setValue(location);
    component.submit();
    expect(gateway.submitCalls).toBe(0);
  });

  it.each([0, -1])('no cotiza vuelos de hoy o anteriores (%s)', (offset) => {
    component.form.patchValue({
      productId: 'parametric',
      airline: 'Avianca',
      flightNumber: 'AV123',
      flightDate: futureDay(offset),
    });
    component.submit();
    expect(gateway.submitCalls).toBe(0);
  });

  it('no arrastra los datos ni las validaciones de clima al cambiar a vida hipotecaria', () => {
    fillWeatherForm(component);
    component.form.patchValue({
      productId: 'mortgage-life',
      birthDate: new Date(1980, 4, 15),
      mortgageBalance: '200000000',
      location: '',
      insuredAmount: '',
    });
    component.submit();
    expect(gateway.lastRequest).toEqual({
      productId: 'mortgage-life',
      productData: { birthDate: '1980-05-15', mortgageBalance: '200000000' },
    });
  });

  it('rechaza un producto desconocido en lugar de enviar datos vacíos', () => {
    component.form.controls.productId.setValue('desconocido');
    component.submit();
    expect(gateway.submitCalls).toBe(0);
    expect(component.form.controls.productId.invalid).toBe(true);
  });

  it.each([
    { productId: 'device-protection', field: 'purchaseValue' as const },
    { productId: 'payment-protection', field: 'monthlyPayment' as const },
    { productId: 'mortgage-life', field: 'mortgageBalance' as const },
  ])('limits $field to 16 positive integer digits', ({ productId, field }) => {
    component.form.controls.productId.setValue(productId);
    const control = component.form.controls[field];
    control.setValue('9999999999999999');
    expect(control.valid).toBe(true);
    for (const value of ['10000000000000000', '0', '-1', '1.5', '1e3']) {
      control.setValue(value);
      expect(control.invalid).toBe(true);
    }
  });

  it('permite escribir las fechas climáticas en formato colombiano', () => {
    fillWeatherForm(component);
    fixture.detectChanges();
    const start = fixture.nativeElement.querySelector('#weather-start-date') as HTMLInputElement;
    const end = fixture.nativeElement.querySelector('#weather-end-date') as HTMLInputElement;
    const startDate = futureDay(10);
    const endDate = futureDay(20);
    enterValue(
      start,
      `${startDate.getDate()}/${startDate.getMonth() + 1}/${startDate.getFullYear()}`,
    );
    enterValue(end, `${endDate.getDate()}/${endDate.getMonth() + 1}/${endDate.getFullYear()}`);

    component.submit();

    expect(gateway.lastRequest?.productData['startDate']).toBe(isoDate(startDate));
    expect(gateway.lastRequest?.productData['endDate']).toBe(isoDate(endDate));
  });
});

function futureDay(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fillWeatherForm(component: QuoteRequestPageComponent): void {
  component.form.patchValue({
    productId: 'parametric-weather',
    location: '  Villavicencio, Meta  ',
    weatherEvent: 'heavy-rain',
    startDate: futureDay(10),
    endDate: futureDay(20),
    insuredAmount: '10000000',
  });
}

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

import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import {
  InsuranceProductNotFoundError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { HttpQuoteRequestGateway } from '../../data-access/quotes/http-quote-request.gateway';
import product from '../../data-access/quotes/testing/insurance-product-detail.json';
import { QuoteRequestPageComponent } from './quote-request-page.component';

const endpoint = `${environment.apiBaseUrl}/v1/productos-seguro`;
const secondProduct = {
  ...product,
  id: 'travel',
  nombre: 'Producto alternativo de prueba',
  descripcion: 'Resumen alternativo de prueba',
  coberturasPrincipales: [],
  coberturas: [],
  condiciones: ['Condición del segundo producto'],
};
const unavailableProduct = {
  ...product,
  id: 'life',
  nombre: 'Seguro no disponible de prueba',
  disponible: false,
};

describe('Catalogo integrado con el formulario y HTTP autenticado', () => {
  const originalMode = environment.dataAccessMode;
  let fixture: ComponentFixture<QuoteRequestPageComponent>;
  let page: QuoteRequestPageComponent;
  let http: HttpTestingController;
  let select: MatSelectHarness;

  beforeEach(async () => {
    environment.dataAccessMode = 'backend';
    await TestBed.configureTestingModule({
      imports: [
        QuoteRequestPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 'client-001',
              name: 'Cliente de prueba',
              email: 'cliente@example.com',
              role: 'client',
              documentType: 'cc',
              nationalId: '1023456789',
              phone: '+573001234567',
            }),
            getAccessToken: () => of('synthetic-test-token'),
          },
        },
        { provide: QUOTE_REQUEST_GATEWAY, useClass: HttpQuoteRequestGateway },
        {
          provide: QUOTE_REQUEST_STORAGE,
          useValue: { read: () => null, write: vi.fn(), clear: vi.fn() },
        },
        { provide: OFFER_SELECTION_STORAGE, useValue: { clear: vi.fn() } },
        {
          provide: PROFILING_GATEWAY,
          useValue: {
            loadConsent: () => of(createConsent()),
            loadProfile: (id: string) => of(createProfile(id)),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(QuoteRequestPageComponent);
    page = fixture.componentInstance;
    fixture.detectChanges();
    const catalog = http.expectOne(endpoint);
    expect(catalog.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    catalog.flush({
      productos: [product, secondProduct, unavailableProduct].map(
        ({ id, nombre, descripcion, disponible, coberturasPrincipales }) => ({
          id,
          nombre,
          descripcion,
          disponible,
          coberturasPrincipales,
        }),
      ),
    });
    http.expectOne(`${environment.apiBaseUrl}/v1/destinos-viaje`).flush({
      destinos: [{ codigo: 'CO', nombre: 'Colombia' }],
    });
    fixture.detectChanges();
    select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
  });

  afterEach(() => {
    http.verify();
    environment.dataAccessMode = originalMode;
  });

  it.each([
    {},
    { id: 'synthetic-audit', estado: 'rechazada' },
    {
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      datosProducto: { vehiclePlate: 'ABC123' },
      correo: 'cliente@example.com',
      telefono: '+573001234567',
      estado: 'fallida',
      creadaEn: '2026-10-11T18:00:00Z',
    },
    {
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      datosProducto: { vehiclePlate: 'ABC123' },
      correo: 'cliente@example.com',
      telefono: '+573001234567',
      estado: 'sin_ofertas',
      creadaEn: '2026-10-11T18:00:00Z',
    },
    {
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'travel',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      datosProducto: { vehiclePlate: 'XYZ999' },
      correo: 'cliente@example.com',
      telefono: '+573001234567',
      estado: 'recibida',
      creadaEn: '2026-10-11T18:00:00Z',
    },
  ])('no persiste ni navega con un recibo inválido y permite reintentar %#', async (response) => {
    await select.clickOptions({ text: product.nombre });
    page.form.patchValue({ vehiclePlate: 'ABC123' });
    page.profilingReady.set(true);
    page.submit();
    http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`).flush(response);
    fixture.detectChanges();
    expect(page.errorKey()).toBe('quoteRequest.errors.unavailable');
    expect(page.form.enabled).toBe(true);
    expect(page.form.controls.vehiclePlate.value).toBe('ABC123');
    expect(page.submittedRequest()).toBeNull();
    expect(TestBed.inject(QUOTE_REQUEST_STORAGE).write).not.toHaveBeenCalled();
    expect(TestBed.inject(OFFER_SELECTION_STORAGE).clear).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();

    page.submit();
    http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`).flush({
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      datosProducto: { vehiclePlate: 'ABC123' },
      correo: 'cliente@example.com',
      telefono: '+573001234567',
      estado: 'recibida',
      creadaEn: '2026-10-11T18:00:00Z',
    });
    expect(page.submittedRequest()?.status).toBe('received');
    expect(TestBed.inject(QUOTE_REQUEST_STORAGE).write).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/app/cotizaciones/ofertas']);
  });

  it('muestra el resumen recibido y consulta el detalle real del producto seleccionado', async () => {
    await select.clickOptions({ text: product.nombre });
    fixture.detectChanges();
    const overview = fixture.nativeElement.querySelector('.product-overview');
    expect(overview).not.toBeNull();
    expect(overview.textContent).toContain(product.descripcion);
    for (const coverage of product.coberturasPrincipales) {
      expect(overview.textContent).toContain(coverage);
    }
    overview.querySelector('button').click();
    fixture.detectChanges();
    const request = http.expectOne(`${endpoint}/${product.id}`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    request.flush(product);
    fixture.detectChanges();

    const detail = fixture.nativeElement.querySelector('.product-details');
    expect(detail).not.toBeNull();
    for (const coverage of product.coberturas) {
      expect(detail.textContent).toContain(coverage.nombre);
      expect(detail.textContent).toContain(coverage.descripcion);
    }
    for (const condition of product.condiciones) {
      expect(detail.textContent).toContain(condition);
    }
    for (const value of Object.values(product.informacionRelevante)) {
      expect(detail.textContent).toContain(value);
    }
    page.form.controls.vehiclePlate.setValue('ABC123');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    const quote = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`);
    expect(quote.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    expect(quote.request.body).toEqual({
      productoId: product.id,
      datosProducto: { vehiclePlate: 'ABC123' },
    });
    quote.flush({
      id: 'AQT-2026-CATALOG',
      productoId: product.id,
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      datosProducto: { vehiclePlate: 'ABC123' },
      correo: 'cliente@example.com',
      telefono: '+573001234567',
      estado: 'recibida',
      creadaEn: '2026-11-01T21:00:00Z',
    });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/app/cotizaciones/ofertas']);
  });

  it('muestra carga accesible y no duplica el GET ni cotiza durante la lectura', async () => {
    await select.clickOptions({ text: product.nombre });
    const button = fixture.nativeElement.querySelector('.product-overview button');
    button.click();
    button.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.product-detail-loading[role="status"]').textContent,
    ).toContain(es.quoteRequest.productDetails.loading);
    expect(fixture.nativeElement.querySelector('.product-details')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    http.expectOne(`${endpoint}/${product.id}`).flush(product);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-detail-loading')).toBeNull();
  });

  it('cancela el detalle anterior al cambiar rapido de producto y no muestra datos cruzados', async () => {
    await select.clickOptions({ text: product.nombre });
    fixture.nativeElement.querySelector('.product-overview button').click();
    const first = http.expectOne(`${endpoint}/${product.id}`);
    await select.clickOptions({ text: secondProduct.nombre });

    expect(first.cancelled).toBe(true);
    expect(fixture.nativeElement.querySelector('.product-details')).toBeNull();
    expect(fixture.nativeElement.querySelector('.product-overview').textContent).not.toContain(
      product.descripcion,
    );
    fixture.nativeElement.querySelector('.product-overview button').click();
    http.expectOne(`${endpoint}/${secondProduct.id}`).flush(secondProduct);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-details').textContent).toContain(
      secondProduct.condiciones[0],
    );
    expect(fixture.nativeElement.querySelector('.product-details').textContent).not.toContain(
      product.condiciones[0],
    );
  });

  it.each([
    {
      status: 503,
      code: 'servicio_no_disponible',
      key: 'error' as const,
      type: QuoteRequestUnavailableError,
    },
    { status: 404, code: 'route_not_found', key: 'error' as const, type: HttpErrorResponse },
    {
      status: 404,
      code: 'seguro_no_encontrado',
      key: 'notFound' as const,
      type: InsuranceProductNotFoundError,
    },
  ])(
    'limpia el detalle previo ante $status/$code y recupera solo el producto actual',
    async ({ status, code, key, type }) => {
      await select.clickOptions({ text: product.nombre });
      fixture.nativeElement.querySelector('.product-overview button').click();
      http.expectOne(`${endpoint}/${product.id}`).flush(product);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.product-details')).not.toBeNull();
      await select.clickOptions({ text: secondProduct.nombre });
      expect(fixture.nativeElement.querySelector('.product-details')).toBeNull();
      fixture.nativeElement.querySelector('.product-overview button').click();
      const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      http
        .expectOne(`${endpoint}/${secondProduct.id}`)
        .flush({ code }, { status, statusText: 'Error' });
      fixture.detectChanges();
      expect(logError).toHaveBeenCalledExactlyOnceWith(
        'Insurance product detail could not be loaded.',
        expect.any(type),
      );
      logError.mockRestore();
      const alert = fixture.nativeElement.querySelector('.product-detail-error[role="alert"]');
      expect(alert.textContent).toContain(es.quoteRequest.productDetails[key]);
      expect(fixture.nativeElement.querySelector('.product-details')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain(product.condiciones[0]);
      expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
      page.form.patchValue({
        destination: { code: 'CO', name: 'Colombia' },
        departureDate: new Date(2028, 0, 1),
        returnDate: new Date(2028, 0, 10),
      });
      page.submit();
      http.expectNone(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`);

      alert.querySelector('button').click();
      http.expectOne(`${endpoint}/${secondProduct.id}`).flush(secondProduct);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.product-detail-error')).toBeNull();
      expect(fixture.nativeElement.querySelector('.product-details').textContent).toContain(
        secondProduct.condiciones[0],
      );
      expect(page.form.valid).toBe(true);
      expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
    },
  );

  it('permite leer un producto no disponible sin permitir cotizarlo', async () => {
    await select.clickOptions({ text: /Seguro no disponible de prueba/ });
    fixture.nativeElement.querySelector('.product-overview button').click();
    http.expectOne(`${endpoint}/${unavailableProduct.id}`).flush(unavailableProduct);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-details').textContent).toContain(
      es.quoteRequest.unavailableProduct,
    );
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    page.submit();
    http.expectNone(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`);
  });

  it('no inventa coberturas ni condiciones cuando los arrays del detalle estan vacios', async () => {
    await select.clickOptions({ text: secondProduct.nombre });
    fixture.nativeElement.querySelector('.product-overview button').click();
    http.expectOne(`${endpoint}/${secondProduct.id}`).flush({ ...secondProduct, condiciones: [] });
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.product-details').textContent;
    expect(text).toContain(es.quoteRequest.productDetails.noCoverages);
    expect(text).toContain(es.quoteRequest.productDetails.noConditions);
    expect(text).not.toContain(product.coberturas[0].descripcion);
  });

  it('retira y cancela el detalle si una recarga del catalogo elimina el producto', async () => {
    await select.clickOptions({ text: product.nombre });
    fixture.nativeElement.querySelector('.product-overview button').click();
    const detail = http.expectOne(`${endpoint}/${product.id}`);
    page.quotes.loadProducts();
    fixture.detectChanges();
    http.expectOne(endpoint).flush({ productos: [] });
    fixture.detectChanges();

    expect(detail.cancelled).toBe(true);
    expect(fixture.nativeElement.querySelector('.product-overview')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.catalog-status[role="status"]').textContent,
    ).toContain(es.quoteRequest.emptyProducts);
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
  });

  it('cancela la lectura al salir de la pagina', async () => {
    await select.clickOptions({ text: product.nombre });
    fixture.nativeElement.querySelector('.product-overview button').click();
    const detail = http.expectOne(`${endpoint}/${product.id}`);
    fixture.destroy();
    expect(detail.cancelled).toBe(true);
  });
});

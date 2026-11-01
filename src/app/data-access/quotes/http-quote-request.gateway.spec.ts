import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpQuoteRequestGateway } from './http-quote-request.gateway';
import { environment } from '../../../environments/environment';
import { QuoteRequestDraft } from '../../core/quotes/quote-request.models';
import {
  InsuranceProductNotFoundError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import productDetail from './testing/insurance-product-detail.json';

describe('HttpQuoteRequestGateway', () => {
  let gateway: HttpQuoteRequestGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpQuoteRequestGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpQuoteRequestGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    [403, 'consentimiento_ausente'],
    [403, 'consentimiento_no_vigente'],
    [422, 'perfil_vencido'],
    [503, 'perfilamiento_no_disponible'],
  ])('conserva el error de perfilamiento %s %s', async (status, code) => {
    const result = firstValueFrom(
      gateway.submitRequest({
        productId: 'automotive',
        productData: { vehiclePlate: 'ABC123' },
      }),
    );
    const assertion = expect(result).rejects.toMatchObject({ status, error: { code } });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`)
      .flush({ code }, { status, statusText: 'Error' });
    await assertion;
  });

  it('loads and maps the insurance catalog', async () => {
    const result = firstValueFrom(gateway.loadProducts());
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`);
    expect(request.request.withCredentials).toBe(false);
    request.flush({
      productos: [
        {
          id: 'automotive',
          nombre: 'Seguro Automotriz Total',
          descripcion: 'Protección para el vehículo',
          disponible: true,
          coberturasPrincipales: ['Daños al vehículo'],
        },
      ],
    });

    await expect(result).resolves.toEqual([
      {
        id: 'automotive',
        name: 'Seguro Automotriz Total',
        description: 'Protección para el vehículo',
        available: true,
        mainCoverages: ['Daños al vehículo'],
      },
    ]);
  });

  it('reads the direct detail DTO and preserves decimal strings and unavailable products', async () => {
    const result = firstValueFrom(gateway.loadProductDetail('automotive'));
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/automotive`);
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(false);
    request.flush({ ...productDetail, disponible: false });
    await expect(result).resolves.toEqual({
      id: productDetail.id,
      name: productDetail.nombre,
      description: productDetail.descripcion,
      available: false,
      mainCoverages: productDetail.coberturasPrincipales,
      coverages: productDetail.coberturas.map(({ nombre, descripcion }) => ({
        name: nombre,
        description: descripcion,
      })),
      conditions: productDetail.condiciones,
      information: {
        insuredAmount: '25000000',
        deductible: '500000',
        currency: 'COP',
        validity: 'Anual con renovación',
      },
    });
  });

  it('accepts empty coverage and condition arrays without inventing contents', async () => {
    const result = firstValueFrom(gateway.loadProductDetail(productDetail.id));
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/${productDetail.id}`).flush({
      ...productDetail,
      coberturasPrincipales: [],
      coberturas: [],
      condiciones: [],
    });
    await expect(result).resolves.toMatchObject({
      mainCoverages: [],
      coverages: [],
      conditions: [],
    });
  });

  it.each([
    null,
    { producto: productDetail },
    { ...productDetail, id: 'travel' },
    { ...productDetail, coberturasPrincipales: undefined },
    { ...productDetail, coberturas: null },
    { ...productDetail, coberturas: [{ nombre: 'Incompleta' }] },
    { ...productDetail, condiciones: [null] },
    { ...productDetail, informacionRelevante: null },
    {
      ...productDetail,
      informacionRelevante: { ...productDetail.informacionRelevante, sumaAsegurada: 25000000 },
    },
    {
      ...productDetail,
      informacionRelevante: { ...productDetail.informacionRelevante, vigencia: undefined },
    },
  ])('rejects malformed or mismatched product details %#', async (body) => {
    const result = firstValueFrom(gateway.loadProductDetail(productDetail.id));
    const assertion = expect(result).rejects.toThrow(/Invalid insurance product/);
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/${productDetail.id}`).flush(body);
    await assertion;
  });

  it('does not turn a malformed catalog into an empty or fabricated catalog', async () => {
    const result = firstValueFrom(gateway.loadProducts());
    const assertion = expect(result).rejects.toThrow('Invalid insurance product response');
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`).flush({
      productos: [{ ...productDetail, coberturasPrincipales: undefined }],
    });
    await assertion;
  });

  it('maps only the domain 404 to product not found', async () => {
    const result = firstValueFrom(gateway.loadProductDetail('not-found'));
    const assertion = expect(result).rejects.toBeInstanceOf(InsuranceProductNotFoundError);
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/not-found`).flush(
      {
        type: 'https://api.solventa.co/problems/seguro_no_encontrado',
        title: 'Seguro no encontrado',
        status: 404,
        detail: 'El seguro consultado no existe o ya no está disponible.',
        code: 'seguro_no_encontrado',
        correlationId: crypto.randomUUID(),
      },
      { status: 404, statusText: 'Not Found' },
    );
    await assertion;
  });

  it('preserves an infrastructure 404 instead of claiming the product is absent', async () => {
    const result = firstValueFrom(gateway.loadProductDetail(productDetail.id));
    const assertion = expect(result).rejects.toMatchObject({ status: 404 });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/${productDetail.id}`)
      .flush({ code: 'route_not_found' }, { status: 404, statusText: 'Not Found' });
    await assertion;
  });

  it('encodes product IDs and keeps unavailable detail requests as errors', async () => {
    const result = firstValueFrom(gateway.loadProductDetail('invalid/id'));
    const assertion = expect(result).rejects.toBeInstanceOf(QuoteRequestUnavailableError);
    http
      .expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/invalid%2Fid`)
      .flush(
        { code: 'servicio_no_disponible' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await assertion;
  });

  it('loads and maps the supported travel destinations', async () => {
    const result = firstValueFrom(gateway.loadTravelDestinations());
    const request = http.expectOne('/api/v1/destinos-viaje');
    expect(request.request.withCredentials).toBe(false);
    request.flush({
      destinos: [
        { codigo: 'CO', nombre: 'Colombia' },
        { codigo: 'ES', nombre: 'España' },
      ],
    });

    await expect(result).resolves.toEqual([
      { code: 'CO', name: 'Colombia' },
      { code: 'ES', name: 'España' },
    ]);
  });

  it('submits a quote request with an idempotency key', async () => {
    const result = firstValueFrom(
      gateway.submitRequest({
        productId: 'automotive',
        productData: { vehiclePlate: 'ABC123' },
      }),
    );
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`);

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(request.request.body).toEqual({
      productoId: 'automotive',
      datosProducto: { vehiclePlate: 'ABC123' },
    });
    request.flush({
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '12.345.678-9',
      datosProducto: { vehiclePlate: 'ABC123' },
      correo: 'cliente@solventa.co',
      telefono: '+573001234567',
      estado: 'recibida',
      creadaEn: '2026-10-11T18:00:00Z',
    });

    await expect(result).resolves.toMatchObject({
      id: 'AQT-2026-ABCDEF1234',
      customerType: 'natural',
      status: 'received',
      productData: { vehiclePlate: 'ABC123' },
    });
  });

  it.each<QuoteRequestDraft>([
    {
      productId: 'travel',
      productData: {
        destinationCountryCode: 'CO',
        departureDate: '2028-01-01',
        returnDate: '2028-01-10',
      },
    },
    { productId: 'life', productData: { birthDate: '1990-01-01' } },
    {
      productId: 'device-protection',
      productData: { deviceType: 'Celular', brandModel: 'Marca Modelo', purchaseValue: '3000000' },
    },
    {
      productId: 'parametric',
      productData: {
        airline: 'Avianca',
        flightNumber: 'AV123',
        flightDate: '2028-01-01',
        coverageType: 'missed-connection',
      },
    },
    {
      productId: 'parametric-weather',
      productData: {
        location: 'Villavicencio, Meta',
        weatherEvent: 'drought',
        startDate: '2028-01-01',
        endDate: '2028-02-01',
        insuredAmount: '10000000',
      },
    },
    {
      productId: 'payment-protection',
      productData: { creditType: 'Consumo', monthlyPayment: '850000' },
    },
    {
      productId: 'mortgage-life',
      productData: { birthDate: '1990-01-01', mortgageBalance: '180000000' },
    },
  ])('respeta el contrato HTTP específico de $productId', async ({ productId, productData }) => {
    const result = firstValueFrom(gateway.submitRequest({ productId, productData }));
    const request = http.expectOne('/api/v1/solicitudes-cotizacion');
    expect(request.request.body).toEqual({ productoId: productId, datosProducto: productData });
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    request.flush({
      id: 'cotizacion-prueba',
      productoId: productId,
      datosProducto: productData,
      tipoCliente: 'persona_natural',
      tipoDocumento: 'cc',
      identificacion: '1023456789',
      correo: 'cliente@solventa.co',
      telefono: '+573001234567',
      estado: 'recibida',
      creadaEn: '2026-10-17T04:00:00Z',
    });
    await expect(result).resolves.toMatchObject({ productId, productData });
  });
});

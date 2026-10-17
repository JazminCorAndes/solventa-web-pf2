import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpQuoteRequestGateway } from './http-quote-request.gateway';
import { environment } from '../../../environments/environment';
import { QuoteRequestDraft } from '../../core/quotes/quote-request.models';

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
        },
      ],
    });

    await expect(result).resolves.toEqual([
      {
        id: 'automotive',
        name: 'Seguro Automotriz Total',
        description: 'Protección para el vehículo',
        available: true,
      },
    ]);
  });

  it('loads and maps the supported travel destinations', async () => {
    const result = firstValueFrom(gateway.loadTravelDestinations());
    const request = http.expectOne('/api/v1/destinos-viaje');
    expect(request.request.withCredentials).toBe(true);
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

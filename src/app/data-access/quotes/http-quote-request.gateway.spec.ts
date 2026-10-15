import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpQuoteRequestGateway } from './http-quote-request.gateway';
import { environment } from '../../../environments/environment';

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

  it('submits a quote request with an idempotency key', async () => {
    const result = firstValueFrom(
      gateway.submitRequest({
        productId: 'automotive',
        customerType: 'natural',
        nationalId: '12.345.678-9',
        vehiclePlate: 'ABC123',
        email: 'cliente@solventa.co',
        phone: '+56912345678',
      }),
    );
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion`);

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(request.request.body.tipoCliente).toBe('persona_natural');
    request.flush({
      id: 'AQT-2026-ABCDEF1234',
      productoId: 'automotive',
      tipoCliente: 'persona_natural',
      identificacion: '12.345.678-9',
      patenteVehiculo: 'ABC123',
      correo: 'cliente@solventa.co',
      telefono: '+56912345678',
      estado: 'recibida',
      creadaEn: '2026-10-11T18:00:00Z',
    });

    await expect(result).resolves.toMatchObject({
      id: 'AQT-2026-ABCDEF1234',
      customerType: 'natural',
      status: 'received',
    });
  });
});

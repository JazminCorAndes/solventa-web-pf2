import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpPaymentGateway } from './http-payment.gateway';

const RESPONSE = {
  pago: {
    id: '40000000-0000-4000-8000-000000000001',
    estado: 'confirmado' as const,
    monto: '89700.00',
    moneda: 'COP',
    metodoPago: 'tarjeta' as const,
    confirmadaEn: '2026-10-16T16:00:00Z',
    transaccion: {
      id: '50000000-0000-4000-8000-000000000001',
      estado: 'confirmado' as const,
      referencia: 'PAY-ABC123',
      procesadaEn: '2026-10-16T16:00:00Z',
    },
  },
  poliza: {
    id: '60000000-0000-4000-8000-000000000001',
    numero: 'SOL-202610-ABC123',
    estado: 'vigente' as const,
    productoId: '11111111-1111-4111-8111-111111111111',
    primaMensual: '89700.00',
    moneda: 'COP',
    vigenteDesde: '2026-10-16T16:00:00Z',
    vigenteHasta: '2027-10-16T16:00:00Z',
    emitidaEn: '2026-10-16T16:00:00Z',
  },
  saga: {
    estado: 'emitida' as const,
    version: 3,
    actualizadaEn: '2026-10-16T16:00:00Z',
  },
};

describe('HttpPaymentGateway', () => {
  let gateway: HttpPaymentGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpPaymentGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpPaymentGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('confirms payment and maps the issued policy', async () => {
    const quoteId = 'AQT-2026-ABCDEF1234';
    const result = firstValueFrom(gateway.pay(quoteId));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${quoteId}/pago`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ metodoPago: 'tarjeta' });
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush(RESPONSE);

    await expect(result).resolves.toMatchObject({
      payment: { status: 'confirmed', amount: 89700, reference: 'PAY-ABC123' },
      policy: { status: 'active', number: 'SOL-202610-ABC123' },
      saga: { status: 'issued', version: 3 },
    });
  });

  it('returns null when a policy has not been issued', async () => {
    const quoteId = 'AQT-2026-ABCDEF1234';
    const result = firstValueFrom(gateway.loadPolicy(quoteId));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${quoteId}/poliza`,
    );
    request.flush({}, { status: 404, statusText: 'Not Found' });

    await expect(result).resolves.toBeNull();
  });
});

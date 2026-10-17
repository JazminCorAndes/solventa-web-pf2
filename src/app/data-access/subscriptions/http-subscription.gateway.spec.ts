import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpSubscriptionGateway } from './http-subscription.gateway';

const RESPONSE = {
  id: '30000000-0000-4000-8000-000000000001',
  solicitudId: 'AQT-2026-ABCDEF1234',
  ofertaId: '20000000-0000-4000-8000-000000000001',
  ofertaVersion: 1,
  estado: 'aprobada' as const,
  reglaVersion: 'suscripcion-automatica-2026.1',
  creadaEn: '2026-10-16T15:00:00Z',
  actualizadaEn: '2026-10-16T15:00:00Z',
  decision: {
    resultado: 'aprobada' as const,
    reglaVersion: 'suscripcion-automatica-2026.1',
    hashDecision: 'a'.repeat(64),
    decididaEn: '2026-10-16T15:00:00Z',
  },
  saga: {
    estado: 'pago_pendiente' as const,
    version: 1,
    actualizadaEn: '2026-10-16T15:00:00Z',
  },
};

describe('HttpSubscriptionGateway', () => {
  let gateway: HttpSubscriptionGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpSubscriptionGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpSubscriptionGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts and maps an approved subscription', async () => {
    const result = firstValueFrom(gateway.start(RESPONSE.solicitudId));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.has('Idempotency-Key')).toBe(true);
    request.flush(RESPONSE);

    await expect(result).resolves.toMatchObject({
      id: RESPONSE.id,
      status: 'approved',
      saga: { status: 'payment_pending' },
    });
  });

  it('returns null when a subscription does not exist', async () => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
    );
    request.flush({}, { status: 404, statusText: 'Not Found' });

    await expect(result).resolves.toBeNull();
  });
});

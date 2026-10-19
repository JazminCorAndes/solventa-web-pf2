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
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
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

  it('maps real coverage dates without using quote validity', async () => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
      )
      .flush({
        ...RESPONSE,
        vigenteDesde: '2026-10-18T12:00:00Z',
        vigenteHasta: '2027-10-18T12:00:00Z',
      });
    await expect(result).resolves.toMatchObject({
      validFrom: '2026-10-18T12:00:00Z',
      validUntil: '2027-10-18T12:00:00Z',
    });
  });

  it.each(['invalid', '2026-10-18', 123])(
    'rejects invalid coverage date %s',
    async (vigenteHasta) => {
      const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
      http
        .expectOne(
          `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
        )
        .flush({
          ...RESPONSE,
          vigenteHasta,
        });
      await expect(result).rejects.toThrow('invalid coverage date');
    },
  );

  it.each([
    { backend: 'aprobada', status: 'approved' },
    { backend: 'revision', status: 'review' },
    { backend: 'rechazada', status: 'rejected' },
  ])(
    'maps decision $backend from GET without fabricating approval',
    async ({ backend, status }) => {
      const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
      const request = http.expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
      );
      expect(request.request.method).toBe('GET');
      request.flush({
        ...RESPONSE,
        estado: backend,
        decision: { ...RESPONSE.decision, resultado: backend },
      });
      await expect(result).resolves.toMatchObject({ status, decision: { result: status } });
    },
  );

  it.each([
    { backend: 'pago_pendiente', status: 'payment_pending' },
    { backend: 'pago_confirmado', status: 'payment_confirmed' },
    { backend: 'emitida', status: 'issued' },
    { backend: 'fallida', status: 'failed' },
  ])('maps saga $backend', async ({ backend, status }) => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
      )
      .flush({ ...RESPONSE, saga: { ...RESPONSE.saga, estado: backend } });
    await expect(result).resolves.toMatchObject({ saga: { status } });
  });

  it.each([
    { estado: 'desconocido' },
    { decision: { ...RESPONSE.decision, resultado: 'desconocido' } },
    { saga: { ...RESPONSE.saga, estado: 'desconocido' } },
  ])('rejects an unknown subscription enum %j', async (fields) => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/suscripcion`,
      )
      .flush({ ...RESPONSE, ...fields });
    await expect(result).rejects.toThrow(/invalid.*status/);
  });
});

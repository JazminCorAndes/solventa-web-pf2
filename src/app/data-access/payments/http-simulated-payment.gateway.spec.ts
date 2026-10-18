import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { PREMIUM_PERIODICITIES } from '../../core/offers/offer.models';
import { CONFIRMED_PAYMENT } from '../../core/payments/simulated-payment.testing';
import { HttpSimulatedPaymentGateway } from './http-simulated-payment.gateway';

const RESPONSE = {
  id: CONFIRMED_PAYMENT.id,
  solicitudId: CONFIRMED_PAYMENT.quoteId,
  suscripcionId: CONFIRMED_PAYMENT.subscriptionId,
  ofertaId: CONFIRMED_PAYMENT.offerId,
  ofertaVersion: CONFIRMED_PAYMENT.offerVersion,
  estado: 'confirmado',
  simulada: true,
  referenciaInterna: CONFIRMED_PAYMENT.reference,
  importe: { monto: '12345.67', moneda: 'COP' },
  periodicidad: CONFIRMED_PAYMENT.periodicity,
  confirmadaEn: CONFIRMED_PAYMENT.confirmedAt,
  saga: { estado: 'pago_confirmado', version: 2, actualizadaEn: CONFIRMED_PAYMENT.saga.updatedAt },
};
const URL = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${RESPONSE.solicitudId}/pago-simulado`;
const KEY = '50000000-0000-4000-8000-000000000001';

describe('HttpSimulatedPaymentGateway', () => {
  let gateway: HttpSimulatedPaymentGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('payment-test-token'));
    auth.renewAccessToken.mockReturnValue(of('renewed-payment-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpSimulatedPaymentGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpSimulatedPaymentGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts only an empty body, the same idempotency key and the session JWT', async () => {
    const result = firstValueFrom(gateway.confirm(RESPONSE.solicitudId, KEY));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('Idempotency-Key')).toBe(KEY);
    expect(request.request.headers.get('Authorization')).toBe('Bearer payment-test-token');
    expect(request.request.withCredentials).toBe(false);
    request.flush(RESPONSE);

    await expect(result).resolves.toEqual(CONFIRMED_PAYMENT);
  });

  it('preserves the body and idempotency key when JWT renewal retries the POST', async () => {
    const result = firstValueFrom(gateway.confirm(RESPONSE.solicitudId, KEY));
    http.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });
    const retry = http.expectOne(URL);
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-payment-test-token');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(KEY);
    expect(retry.request.body).toEqual({});
    retry.flush(RESPONSE);

    await expect(result).resolves.toEqual(CONFIRMED_PAYMENT);
  });

  it('gets a persisted simulated payment without creating another one', async () => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer payment-test-token');
    request.flush(RESPONSE);

    await expect(result).resolves.toEqual(CONFIRMED_PAYMENT);
  });

  it('treats only pago_no_encontrado as an expected missing payment', async () => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http
      .expectOne(URL)
      .flush({ code: 'pago_no_encontrado' }, { status: 404, statusText: 'Not Found' });

    await expect(result).resolves.toBeNull();
  });

  it.each([
    { status: 404, body: { code: 'solicitud_no_encontrada' } },
    { status: 404, body: {} },
    { status: 503, body: { code: 'servicio_no_disponible' } },
    { status: 422, body: { code: 'pago_no_permitido' } },
    { status: 409, body: { code: 'conflicto_idempotencia' } },
  ])('propagates HTTP $status %j without a successful fallback', async ({ status, body }) => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http.expectOne(URL).flush(body, { status, statusText: 'Error' });

    await expect(result).rejects.toMatchObject({ status, error: body });
  });

  it.each(PREMIUM_PERIODICITIES)('preserves the %s periodicity', async (periodicity) => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http.expectOne(URL).flush({ ...RESPONSE, periodicidad: periodicity });

    await expect(result).resolves.toMatchObject({ periodicity });
  });

  it.each([
    { estado: 'pendiente' },
    { simulada: false },
    { referenciaInterna: 'REAL-PAYMENT' },
    { importe: { monto: '-1', moneda: 'COP' } },
    { importe: { monto: 'NaN', moneda: 'COP' } },
    { importe: { monto: '0', moneda: 'COP' } },
    { importe: { monto: '12', moneda: '' } },
    { importe: null },
    { periodicidad: 'unico' },
    { confirmadaEn: 'invalid-date' },
    { ofertaVersion: 0 },
    { saga: { ...RESPONSE.saga, estado: 'emitida' } },
    { saga: { ...RESPONSE.saga, version: 1 } },
    { saga: null },
  ])('rejects a malformed or non-simulated response %j', async (fields) => {
    const result = firstValueFrom(gateway.load(RESPONSE.solicitudId));
    http.expectOne(URL).flush({ ...RESPONSE, ...fields });

    await expect(result).rejects.toThrow('The simulated payment response is invalid.');
  });
});

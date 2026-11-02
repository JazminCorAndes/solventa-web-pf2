import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { appConfig } from '../../app.config';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { DASHBOARD_GATEWAY } from '../../core/dashboard/dashboard.gateway';
import {
  DASHBOARD_RESPONSE,
  DASHBOARD_SNAPSHOT,
  EMPTY_DASHBOARD,
  REJECTED_DASHBOARD_RESPONSE,
  REJECTED_DASHBOARD_PAYMENT,
} from '../../core/dashboard/dashboard.testing';
import { PREMIUM_PERIODICITIES } from '../../core/offers/offer.models';
import { PENDING_PAYMENT_RESPONSE } from '../../core/payments/simulated-payment.testing';
import { HttpDashboardGateway } from './http-dashboard.gateway';
import populatedReal from './testing/dashboard-populated-real.json';
import emptyReal from './testing/dashboard-empty-real.json';
import policyIntegration from './testing/dashboard-policies-integration.json';

const URL = `${environment.apiBaseUrl}/v1/clientes/me/dashboard`;
const EMPTY_RESPONSE = {
  ...DASHBOARD_RESPONSE,
  cotizaciones: [],
  suscripciones: [],
  pagos: [],
  polizas: [],
};

describe('HttpDashboardGateway', () => {
  let gateway: HttpDashboardGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('dashboard-test-token'));
    auth.renewAccessToken.mockReturnValue(of('renewed-dashboard-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpDashboardGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpDashboardGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current account from the main BFF with JWT and no client ID', async () => {
    const result = firstValueFrom(gateway.load());
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${'dashboard-test-token'}`);
    expect(request.request.withCredentials).toBe(false);
    request.flush(DASHBOARD_RESPONSE);
    await expect(result).resolves.toEqual(DASHBOARD_SNAPSHOT);
  });

  it('preserves subscription coverage separately from quote validity', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(`${environment.apiBaseUrl}/v1/clientes/me/dashboard`).flush({
      ...DASHBOARD_RESPONSE,
      suscripciones: DASHBOARD_RESPONSE.suscripciones.map((item) => ({
        ...item,
        vigenteDesde: '2026-10-01T12:15:00Z',
        vigenteHasta: '2027-10-01T12:15:00Z',
      })),
    });
    const snapshot = await result;
    expect(snapshot.subscriptions[0].validUntil).toBe('2027-10-01T12:15:00Z');
    expect(snapshot.quotes[0].validUntil).toBe(DASHBOARD_RESPONSE.cotizaciones[0].validaHasta);
  });

  it('renews the session on 401 using the existing interceptor', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });
    const retry = http.expectOne(URL);
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(retry.request.headers.get('Authorization')).toBe(
      `Bearer ${'renewed-dashboard-test-token'}`,
    );
    retry.flush(EMPTY_RESPONSE);
    await expect(result).resolves.toEqual(EMPTY_DASHBOARD);
  });

  it('accepts real empty lists without treating unavailable domains as empty lists', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush(EMPTY_RESPONSE);
    await expect(result).resolves.toEqual(EMPTY_DASHBOARD);
  });

  it('maps a definitive simulated rejection without a confirmation timestamp', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush({ ...EMPTY_RESPONSE, pagos: [REJECTED_DASHBOARD_RESPONSE] });
    const snapshot = await result;
    expect(snapshot.payments).toEqual([REJECTED_DASHBOARD_PAYMENT]);
    expect(snapshot.payments[0]).not.toHaveProperty('confirmedAt');
  });

  it('maps an unresolved payment without inventing a final outcome or policy', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush({ ...EMPTY_RESPONSE, pagos: [PENDING_PAYMENT_RESPONSE] });
    const snapshot = await result;
    expect(snapshot.payments).toEqual([
      {
        id: PENDING_PAYMENT_RESPONSE.id,
        requestId: PENDING_PAYMENT_RESPONSE.solicitudId,
        subscriptionId: PENDING_PAYMENT_RESPONSE.suscripcionId,
        status: 'pendiente',
        simulated: true,
        amount: { amount: '12345.67', currency: 'COP' },
        periodicity: PENDING_PAYMENT_RESPONSE.periodicidad,
        createdAt: PENDING_PAYMENT_RESPONSE.creadaEn,
        code: 'resultado_no_confirmado',
      },
    ]);
    expect(snapshot.payments[0]).not.toHaveProperty('confirmedAt');
    expect(snapshot.payments[0]).not.toHaveProperty('rejectedAt');
    expect(snapshot.policies).toEqual([]);
  });

  it.each([
    { creadaEn: undefined },
    { creadaEn: 'invalid' },
    { creadaEn: '2026-10-01T10:00:00-05:00' },
    { codigo: 'confirmed' },
    { confirmadaEn: null },
    { rechazadaEn: null },
    { motivo: 'rechazo_simulado' },
  ])('rejects inconsistent pending history %j', async (fields) => {
    const result = firstValueFrom(gateway.load());
    http
      .expectOne(URL)
      .flush({ ...EMPTY_RESPONSE, pagos: [{ ...PENDING_PAYMENT_RESPONSE, ...fields }] });
    await expect(result).rejects.toThrow('The dashboard response is invalid.');
  });

  it.each([
    { confirmadaEn: '2026-10-01T12:15:00Z' },
    { confirmadaEn: null },
    { rechazadaEn: undefined },
    { rechazadaEn: '2026-10-01' },
    { motivo: 'otro' },
  ])('rejects inconsistent rejection history %j', async (fields) => {
    const result = firstValueFrom(gateway.load());
    http
      .expectOne(URL)
      .flush({ ...EMPTY_RESPONSE, pagos: [{ ...REJECTED_DASHBOARD_RESPONSE, ...fields }] });
    await expect(result).rejects.toThrow('The dashboard response is invalid.');
  });

  it('propagates a network failure without presenting empty account records', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).error(new ProgressEvent('error'));
    await expect(result).rejects.toMatchObject({ status: 0 });
  });

  it('maps persisted policy fields without deriving them from subscriptions or payments', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush(DASHBOARD_RESPONSE);
    const snapshot = await result;
    expect(snapshot.policies).toEqual(DASHBOARD_SNAPSHOT.policies);
    expect(snapshot.subscriptions).toEqual(DASHBOARD_SNAPSHOT.subscriptions);
  });

  it('consumes the captured policy response from authenticated HTTP services and migrated databases', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush(policyIntegration.populated);
    const snapshot = await result;
    const source = policyIntegration.populated.polizas[0];
    expect(snapshot.policies).toEqual([
      {
        id: source.id,
        subscriptionId: source.suscripcionId,
        type: source.tipo,
        startDate: source.fechaInicio,
        endDate: source.fechaFin,
        status: source.estado,
        simulated: source.simulada,
      },
    ]);
    expect(snapshot.subscriptions[0].id).toBe(source.suscripcionId);
    expect(snapshot.payments[0].subscriptionId).toBe(source.suscripcionId);
    expect(snapshot.quotes[0].productId).toBe(source.tipo);
  });

  it('consumes the captured empty policy account without fallback', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush(policyIntegration.empty);
    await expect(result).resolves.toEqual(EMPTY_DASHBOARD);
  });

  it.each([populatedReal, emptyReal])(
    'rejects the captured legacy policy-unavailable contract',
    async (response) => {
      const result = firstValueFrom(gateway.load());
      http.expectOne(URL).flush(response);
      await expect(result).rejects.toThrow('The dashboard response is invalid.');
    },
  );

  it.each([400, 403, 404, 500, 503])(
    'propagates HTTP %s without fixture or empty fallback',
    async (status) => {
      const result = firstValueFrom(gateway.load());
      http
        .expectOne(URL)
        .flush({ code: 'servicio_no_disponible' }, { status, statusText: 'Error' });
      await expect(result).rejects.toMatchObject({ status });
    },
  );

  it.each(PREMIUM_PERIODICITIES)('preserves %s amounts and periodicity', async (periodicidad) => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush({
      ...DASHBOARD_RESPONSE,
      pagos: [
        {
          ...DASHBOARD_RESPONSE.pagos[0],
          periodicidad,
          importe: { monto: '9999999999999999.99', moneda: 'USD' },
        },
      ],
    });
    await expect(result).resolves.toMatchObject({
      payments: [
        { amount: { amount: '9999999999999999.99', currency: 'USD' }, periodicity: periodicidad },
      ],
    });
  });

  it('preserves legacy products, future statuses and unselected quotes without inventing periodicity', async () => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush({
      ...EMPTY_RESPONSE,
      cotizaciones: [
        {
          ...DASHBOARD_RESPONSE.cotizaciones[0],
          solicitudId: null,
          productoId: 'legacy-id',
          estado: 'FUTURO',
          seleccion: null,
        },
      ],
    });
    await expect(result).resolves.toMatchObject({
      quotes: [{ requestId: null, productId: 'legacy-id', status: 'FUTURO', selection: null }],
    });
  });

  it.each([
    null,
    {},
    { ...EMPTY_RESPONSE, cotizaciones: null },
    { ...EMPTY_RESPONSE, pagos: {} },
    { ...EMPTY_RESPONSE, polizas: { disponibilidad: 'no_implementado' } },
    { ...EMPTY_RESPONSE, polizas: null },
    { ...DASHBOARD_RESPONSE, polizas: [{}] },
    { ...DASHBOARD_RESPONSE, polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], simulada: false }] },
    { ...DASHBOARD_RESPONSE, polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], simulada: undefined }] },
    { ...DASHBOARD_RESPONSE, polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], suscripcionId: '' }] },
    { ...DASHBOARD_RESPONSE, polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], tipo: null }] },
    { ...DASHBOARD_RESPONSE, polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], estado: '' }] },
    {
      ...DASHBOARD_RESPONSE,
      polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], fechaInicio: '2026-02-30' }],
    },
    {
      ...DASHBOARD_RESPONSE,
      polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], fechaInicio: '2026-10-10T00:00:00Z' }],
    },
    {
      ...DASHBOARD_RESPONSE,
      polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], fechaFin: '2026-10-09' }],
    },
    {
      ...DASHBOARD_RESPONSE,
      polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], fechaFin: '2026-13-01' }],
    },
    { ...EMPTY_RESPONSE, notificaciones: { disponibilidad: 'disponible' } },
    {
      ...DASHBOARD_RESPONSE,
      cotizaciones: [{ ...DASHBOARD_RESPONSE.cotizaciones[0], seleccion: {} }],
    },
    {
      ...DASHBOARD_RESPONSE,
      cotizaciones: [{ ...DASHBOARD_RESPONSE.cotizaciones[0], creadaEn: 'invalid' }],
    },
    {
      ...DASHBOARD_RESPONSE,
      cotizaciones: [{ ...DASHBOARD_RESPONSE.cotizaciones[0], creadaEn: '2026-10-01T12:00:00' }],
    },
    {
      ...DASHBOARD_RESPONSE,
      cotizaciones: [
        {
          ...DASHBOARD_RESPONSE.cotizaciones[0],
          primaEstimada: { monto: '1.999', moneda: 'COP' },
        },
      ],
    },
    {
      ...DASHBOARD_RESPONSE,
      cotizaciones: [
        { ...DASHBOARD_RESPONSE.cotizaciones[0], primaEstimada: { monto: '-1', moneda: 'COP' } },
      ],
    },
    {
      ...DASHBOARD_RESPONSE,
      suscripciones: [
        {
          ...DASHBOARD_RESPONSE.suscripciones[0],
          saga: { estado: 'pago_pendiente', version: 0, actualizadaEn: '2026-10-01T12:15:00Z' },
        },
      ],
    },
    { ...DASHBOARD_RESPONSE, pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], simulada: false }] },
    { ...DASHBOARD_RESPONSE, pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], estado: 'pendiente' }] },
    {
      ...DASHBOARD_RESPONSE,
      pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], importe: { monto: '0.00', moneda: 'COP' } }],
    },
    {
      ...DASHBOARD_RESPONSE,
      pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], importe: { monto: 'NaN', moneda: 'COP' } }],
    },
    {
      ...DASHBOARD_RESPONSE,
      pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], importe: { monto: '1.00', moneda: 'cop' } }],
    },
    { ...DASHBOARD_RESPONSE, pagos: [{ ...DASHBOARD_RESPONSE.pagos[0], periodicidad: 'anual' }] },
  ])('rejects invalid responses rather than displaying successful metrics %#', async (response) => {
    const result = firstValueFrom(gateway.load());
    http.expectOne(URL).flush(response);
    await expect(result).rejects.toThrow('The dashboard response is invalid.');
  });
});

describe('Dashboard production registration', () => {
  it('uses HTTP in the real application configuration', () => {
    TestBed.configureTestingModule({
      providers: [
        appConfig.providers,
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { synchronizeSession: () => of(undefined) } },
      ],
    });
    expect(TestBed.inject(DASHBOARD_GATEWAY)).toBeInstanceOf(HttpDashboardGateway);
  });
});

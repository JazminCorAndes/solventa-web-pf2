import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { problem } from '../../core/policies/policy-renewal.testing';
import {
  OperationalReportError,
  ReportFilters,
} from '../../core/reports/operational-report.models';
import {
  EMPTY_INDICATORS,
  OPTIONS_RESPONSE,
  REPORT_CUT_OFF,
  REPORT_FINGERPRINT,
  reportResponse,
} from '../../core/reports/operational-report.testing';
import { HttpOperationalReportGateway } from './http-operational-report.gateway';

const BASE = `${environment.apiBaseUrl}/v1/reportes/operativos`;
const FILTERS: ReportFilters = {
  from: '2026-11-01',
  to: '2026-11-19',
  product: 'automotive',
  status: 'vigente',
};
const RESPONSE_FILTERS = {
  desde: FILTERS.from,
  hasta: FILTERS.to,
  producto: FILTERS.product,
  estado: FILTERS.status,
};

describe('HttpOperationalReportGateway', () => {
  let gateway: HttpOperationalReportGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('advisor-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpOperationalReportGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpOperationalReportGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the filter catalog allowed for the user', async () => {
    const result = firstValueFrom(gateway.options());
    const request = http.expectOne(`${BASE}/opciones`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer advisor-test-token');
    request.flush(OPTIONS_RESPONSE);
    expect(await result).toMatchObject({
      maxPeriodDays: 366,
      statuses: ['programada', 'vigente', 'vencida', 'cancelada'],
    });
  });

  it('sends only the chosen filters and returns the indicators at the cut-off', async () => {
    const result = firstValueFrom(gateway.report(FILTERS, null));
    const request = http.expectOne((req) => req.url === BASE);
    expect(request.request.params.keys().sort()).toEqual(['desde', 'estado', 'hasta', 'producto']);
    expect(request.request.params.get('producto')).toBe('automotive');
    request.flush(reportResponse(RESPONSE_FILTERS));

    const report = await result;
    expect(report.cutOff).toBe(REPORT_CUT_OFF);
    expect(report.policies.portfolio).toBe(4);
    expect(report.premiums.totals).toEqual([{ currency: 'COP', amount: '255000.00' }]);
    expect(report.payments.totals[0]).toMatchObject({ status: 'confirmado' });
    expect(report.fingerprint).toBe(REPORT_FINGERPRINT);
  });

  it('asks for a specific cut-off and rejects a report for another cut-off', async () => {
    const cutOff = '2026-11-18T12:00:00Z';
    const result = firstValueFrom(
      gateway.report({ ...FILTERS, product: null, status: null }, cutOff),
    );
    const request = http.expectOne((req) => req.url === BASE);
    expect(request.request.params.get('corte')).toBe(cutOff);
    expect(request.request.params.has('producto')).toBe(false);
    request.flush(reportResponse({ desde: FILTERS.from, hasta: FILTERS.to }));
    await expect(result).rejects.toThrow('invalid');
  });

  it('never accepts an incomplete or inconsistent report as valid', async () => {
    const missingSource = firstValueFrom(gateway.report(FILTERS, null));
    http
      .expectOne((req) => req.url === BASE)
      .flush(
        reportResponse(RESPONSE_FILTERS, {
          fuentes: [{ servicio: 'polizas', registros: 4, huella: '1'.repeat(64) }],
        }),
      );
    await expect(missingSource).rejects.toThrow('invalid');

    const wrongBreakdown = firstValueFrom(gateway.report(FILTERS, null));
    http
      .expectOne((req) => req.url === BASE)
      .flush(
        reportResponse(RESPONSE_FILTERS, {
          indicadores: {
            ...EMPTY_INDICATORS,
            polizas: { ...EMPTY_INDICATORS.polizas, cartera: 2 },
          },
        }),
      );
    await expect(wrongBreakdown).rejects.toThrow('invalid');
  });

  it.each([
    [403, 'alcance_insuficiente', {}, { kind: 'forbidden' }],
    [400, 'solicitud_invalida', {}, { kind: 'invalid-filters' }],
    [
      503,
      'consolidacion_incompleta',
      { fuente: 'siniestros' },
      { kind: 'incomplete', source: 'siniestros' },
    ],
  ])('maps the %s %s problem', async (status, code, extra, expected) => {
    const result = firstValueFrom(gateway.report(FILTERS, null));
    http
      .expectOne((req) => req.url === BASE)
      .flush(problem(status, code, extra), { status, statusText: 'Problem' });
    const error = await result.catch((value: unknown) => value);
    expect(error).toBeInstanceOf(OperationalReportError);
    expect(error).toMatchObject(expected);
  });

  it('downloads the confirmed report with its cut-off and fingerprint', async () => {
    const result = firstValueFrom(gateway.download(FILTERS, REPORT_CUT_OFF, REPORT_FINGERPRINT));
    const request = http.expectOne((req) => req.url === `${BASE}/descarga`);
    expect(request.request.params.get('corte')).toBe(REPORT_CUT_OFF);
    expect(request.request.params.get('huella')).toBe(REPORT_FINGERPRINT);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['ambito,indicador'], { type: 'text/csv' }), {
      headers: { 'X-Reporte-Huella': REPORT_FINGERPRINT, 'X-Reporte-Corte': REPORT_CUT_OFF },
    });

    const download = await result;
    expect(download.fileName).toBe(`reporte-operativo-${REPORT_FINGERPRINT.slice(0, 12)}.csv`);
    expect(await download.file.text()).toContain('ambito');
  });

  it('reads the problem of a rejected download from its blob body', async () => {
    const result = firstValueFrom(gateway.download(FILTERS, REPORT_CUT_OFF, REPORT_FINGERPRINT));
    http
      .expectOne((req) => req.url === `${BASE}/descarga`)
      .flush(
        new Blob([JSON.stringify(problem(409, 'reporte_no_reproducible'))], {
          type: 'application/problem+json',
        }),
        { status: 409, statusText: 'Conflict' },
      );
    await expect(result).rejects.toMatchObject({ kind: 'not-reproducible' });
  });
});

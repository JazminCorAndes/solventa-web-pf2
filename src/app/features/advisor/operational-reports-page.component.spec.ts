import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { problem } from '../../core/policies/policy-renewal.testing';
import { OPERATIONAL_REPORT_GATEWAY } from '../../core/reports/operational-report.gateway';
import {
  EMPTY_INDICATORS,
  OPTIONS_RESPONSE,
  REPORT_CUT_OFF,
  REPORT_FINGERPRINT,
  reportResponse,
} from '../../core/reports/operational-report.testing';
import { HttpOperationalReportGateway } from '../../data-access/reports/http-operational-report.gateway';
import { OperationalReportsPageComponent } from './operational-reports-page.component';

registerLocaleData(localeEsCo);
const BASE = `${environment.apiBaseUrl}/v1/reportes/operativos`;
const PERIOD = { from: '2026-11-01', to: '2026-11-19' };
const RESPONSE_FILTERS = { desde: PERIOD.from, hasta: PERIOD.to };

describe('OperationalReportsPageComponent with HTTP consumer', () => {
  let fixture: ComponentFixture<OperationalReportsPageComponent>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const find = (testId: string) => root().querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const render = () => fixture.detectChanges();
  const component = () => fixture.componentInstance;
  const submit = () => {
    (find('report-query') as HTMLButtonElement).click();
    render();
  };
  const reportRequest = () => http.expectOne((req) => req.url === BASE);

  async function setup(options: object | null = OPTIONS_RESPONSE, status = 403) {
    await TestBed.configureTestingModule({
      imports: [
        OperationalReportsPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OPERATIONAL_REPORT_GATEWAY, useClass: HttpOperationalReportGateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OperationalReportsPageComponent);
    http = TestBed.inject(HttpTestingController);
    render();
    const request = http.expectOne(`${BASE}/opciones`);
    if (options) {
      request.flush(options);
    } else {
      request.flush(
        problem(status, status === 403 ? 'alcance_insuficiente' : 'servicio_no_disponible'),
        { status, statusText: 'Error' },
      );
    }
    render();
    component().form.patchValue(PERIOD);
    render();
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('queries with the chosen period, product and status and shows the cut-off', async () => {
    await setup();
    component().form.patchValue({ product: 'automotive', status: 'vigente' });
    submit();
    expect(find('report-loading')).not.toBeNull();

    const request = reportRequest();
    expect(request.request.params.get('desde')).toBe(PERIOD.from);
    expect(request.request.params.get('estado')).toBe('vigente');
    request.flush(
      reportResponse({ ...RESPONSE_FILTERS, producto: 'automotive', estado: 'vigente' }),
    );
    render();

    expect(find('report-cut-off-value')?.textContent).toContain('2026');
    expect(find('indicator-policies')?.textContent).toContain('4');
    expect(find('indicator-premiums')?.textContent).toContain('255.000');
    expect(find('indicator-claims')?.textContent).toContain(
      es.operationalReports.claimStates.aprobado,
    );
    expect(find('indicator-payments')?.textContent).toContain(
      es.operationalReports.paymentStates.confirmado,
    );
    expect(find('report-by-product')?.textContent).toContain(
      es.operationalReports.products.automotive,
    );
    expect(find('report-inconsistencies')?.textContent).toContain(
      es.operationalReports.inconsistencyTypes.policiesWithoutPremium,
    );
  });

  it('validates the period before calling the backend', async () => {
    await setup();
    component().form.patchValue({ from: '2026-11-19', to: '2026-11-01' });
    submit();
    expect(find('report-period-error')?.textContent).toContain(
      es.operationalReports.periodErrors.order,
    );

    component().form.patchValue({ from: '2025-01-01', to: '2026-11-01' });
    submit();
    expect(find('report-period-error')?.textContent).toContain(
      es.operationalReports.periodErrors.length,
    );
  });

  it('distinguishes the absence of results from an error', async () => {
    await setup();
    submit();
    reportRequest().flush(reportResponse(RESPONSE_FILTERS, { indicadores: EMPTY_INDICATORS }));
    render();
    expect(find('report-empty')?.textContent).toContain(es.operationalReports.empty);
    expect(find('report-indicators')).toBeNull();
  });

  it('does not present a partial report when a source fails', async () => {
    await setup();
    submit();
    reportRequest().flush(problem(503, 'consolidacion_incompleta', { fuente: 'primas' }), {
      status: 503,
      statusText: 'Unavailable',
    });
    render();
    expect(find('report-incomplete')?.textContent).toContain(es.operationalReports.sources.primas);
    expect(find('report-indicators')).toBeNull();
    expect(find('report-download')).toBeNull();
  });

  it('shows only an authorization message to users without the report scope', async () => {
    await setup(null);
    expect(find('report-forbidden')?.textContent).toContain(es.operationalReports.forbidden);
    expect(find('report-filters')).toBeNull();
  });

  it('retries unavailable options without showing a local catalog or querying a report', async () => {
    await setup(null, 503);
    const filters = component().form.getRawValue();
    expect(find('report-options-error')?.textContent).toContain(es.operationalReports.optionsError);
    expect(find('report-filters')).toBeNull();
    expect(find('report-idle')).toBeNull();
    component().query();
    http.expectNone((req) => req.url === BASE);

    find('report-options-error')?.querySelector<HTMLButtonElement>('button')?.click();
    render();
    expect(find('report-options-loading')).not.toBeNull();
    expect(find('report-filters')).toBeNull();
    component().query();
    http.expectNone((req) => req.url === BASE);
    const retry = http.expectOne(`${BASE}/opciones`);
    retry.flush({ ...OPTIONS_RESPONSE, productos: ['automotive'] });
    render();

    expect(find('report-options-error')).toBeNull();
    expect(find('report-idle')).not.toBeNull();
    expect(find('report-filters')).not.toBeNull();
    expect(component().options()?.products).toEqual(['automotive']);
    expect(component().form.getRawValue()).toEqual(filters);
    expect(find('report-indicators')).toBeNull();
    http.expectNone((req) => req.url === BASE);
  });

  it('downloads exactly the confirmed report and reports when it is no longer reproducible', async () => {
    // spyOn (y no reemplazar la propiedad) para que restoreAllMocks deje URL intacto.
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    await setup();
    submit();
    reportRequest().flush(reportResponse(RESPONSE_FILTERS));
    render();

    (find('report-download') as HTMLButtonElement).click();
    const download = http.expectOne((req) => req.url === `${BASE}/descarga`);
    expect(download.request.params.get('corte')).toBe(REPORT_CUT_OFF);
    expect(download.request.params.get('huella')).toBe(REPORT_FINGERPRINT);
    download.flush(new Blob(['csv']), { headers: { 'X-Reporte-Huella': REPORT_FINGERPRINT } });
    render();
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    (find('report-download') as HTMLButtonElement).click();
    http
      .expectOne((req) => req.url === `${BASE}/descarga`)
      .flush(new Blob([JSON.stringify(problem(409, 'reporte_no_reproducible'))]), {
        status: 409,
        statusText: 'Conflict',
      });
    await fixture.whenStable();
    render();
    expect(find('report-not-reproducible')?.textContent).toContain(
      es.operationalReports.notReproducible,
    );
  });

  it('discards the report shown when the filters change', async () => {
    await setup();
    submit();
    reportRequest().flush(reportResponse(RESPONSE_FILTERS));
    render();
    expect(find('report-indicators')).not.toBeNull();

    component().form.patchValue({ status: 'cancelada' });
    render();
    expect(find('report-indicators')).toBeNull();
    expect(find('report-idle')).not.toBeNull();
  });
});

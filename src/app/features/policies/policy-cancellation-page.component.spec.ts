import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { POLICY_CANCELLATION_GATEWAY } from '../../core/policies/policy-cancellation.gateway';
import { NOT_CANCELLABLE_REASONS } from '../../core/policies/policy-cancellation.models';
import {
  CANCELLED_STATE_RESPONSE,
  CANCELLATION_POLICY_ID,
  CANCELLATION_RESULT_RESPONSE,
  CANCELLATION_STATE_RESPONSE,
  SETTLEMENT_HASH,
  SETTLEMENT_RESPONSE,
} from '../../core/policies/policy-cancellation.testing';
import { HttpPolicyCancellationGateway } from '../../data-access/policies/http-policy-cancellation.gateway';
import { PolicyCancellationPageComponent } from './policy-cancellation-page.component';

registerLocaleData(localeEsCo);
const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${CANCELLATION_POLICY_ID}`;

describe('PolicyCancellationPageComponent with authenticated HTTP consumer', () => {
  let fixture: ComponentFixture<PolicyCancellationPageComponent>;
  let http: HttpTestingController;
  const user = signal<{ id: string } | null>({ id: 'cancellation-client' });
  const dashboard = { load: vi.fn() };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const root = () => fixture.nativeElement as HTMLElement;
  const find = (name: string) => root().querySelector<HTMLElement>(`[data-testid="${name}"]`);
  const button = (name: string) => find(name) as HTMLButtonElement;
  const render = () => fixture.detectChanges();

  async function setup(
    state: object = CANCELLATION_STATE_RESPONSE,
    policyId = CANCELLATION_POLICY_ID,
  ) {
    params = new BehaviorSubject(convertToParamMap({ policyId }));
    await TestBed.configureTestingModule({
      imports: [
        PolicyCancellationPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: {
            availableLangs: ['es', 'en'],
            defaultLang: 'es',
            reRenderOnLangChange: true,
          },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: POLICY_CANCELLATION_GATEWAY, useClass: HttpPolicyCancellationGateway },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        {
          provide: AuthService,
          useValue: { user, getAccessToken: () => of('synthetic-client-token') },
        },
        { provide: DashboardService, useValue: dashboard },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyCancellationPageComponent);
    http = TestBed.inject(HttpTestingController);
    render();
    if (policyId === CANCELLATION_POLICY_ID) {
      const request = http.expectOne(`${BASE}/cancelacion`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-client-token');
      request.flush(state);
      render();
    }
  }

  function accept(): void {
    fixture.componentInstance.selectReason('costo');
    root().querySelector<HTMLInputElement>('[data-testid="cancellation-accept"] input')!.click();
    render();
  }

  function send() {
    accept();
    button('cancellation-confirm').click();
    render();
    return http.expectOne(`${BASE}/cancelaciones`);
  }

  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 'cancellation-client' });
    dashboard.load.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows authoritative amounts, ended coverage and contextual return without confirming', async () => {
    await setup();
    expect(find('cancellation-refund')?.textContent).toContain('41.129');
    expect(find('cancellation-settlement')?.textContent).toContain('Fallecimiento');
    expect(root().textContent).toContain(es.policyCancellation.academic);
    expect(button('cancellation-confirm').disabled).toBe(true);
    expect(find('cancellation-back')?.getAttribute('href')).toBe(
      `/app/polizas/${CANCELLATION_POLICY_ID}`,
    );
    expect(root().querySelector('a[href$="' + CANCELLATION_POLICY_ID + '"]')).not.toBeNull();
    http.expectNone(`${BASE}/cancelaciones`);
  });

  it('requires both a reason and explicit confirmation and resets acceptance when the reason changes', async () => {
    await setup();
    fixture.componentInstance.confirm();
    fixture.componentInstance.selectReason('costo');
    render();
    expect(button('cancellation-confirm').disabled).toBe(true);
    accept();
    expect(button('cancellation-confirm').disabled).toBe(false);
    fixture.componentInstance.selectReason('otro');
    render();
    expect(button('cancellation-confirm').disabled).toBe(true);
    http.expectNone(`${BASE}/cancelaciones`);
  });

  it('submits the exact contract only once and presents a recorded cancellation', async () => {
    await setup();
    const request = send();
    fixture.componentInstance.confirm();
    expect(request.request.body).toEqual({
      confirma: true,
      motivoCancelacion: 'costo',
      liquidacionHash: SETTLEMENT_HASH,
    });
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-client-token');
    request.flush(CANCELLATION_RESULT_RESPONSE, { status: 201, statusText: 'Created' });
    render();
    expect(find('cancellation-result')?.textContent).toContain(CANCELLATION_RESULT_RESPONSE.id);
    expect(find('cancellation-form')).toBeNull();
    expect(find('cancellation-pending')).toBeNull();
    expect(find('cancellation-refund')?.textContent).toContain('41.129');
    expect(dashboard.load).toHaveBeenCalledOnce();
  });

  it.each(NOT_CANCELLABLE_REASONS)(
    'explains ineligibility %s without a submission form',
    async (reason) => {
      await setup({
        ...CANCELLATION_STATE_RESPONSE,
        estado: reason === 'poliza_cancelada' ? 'cancelada' : 'activa',
        cancelable: false,
        motivo: reason,
        liquidacion: null,
      });
      expect(find('cancellation-ineligible')?.textContent).toContain(
        es.policyCancellation.ineligible[reason],
      );
      expect(find('cancellation-form')).toBeNull();
      fixture.componentInstance.confirm();
      http.expectNone(`${BASE}/cancelaciones`);
    },
  );

  it('recovers the registered result through GET without a new POST', async () => {
    await setup(CANCELLED_STATE_RESPONSE);
    expect(find('cancellation-result')?.textContent).toContain(CANCELLATION_RESULT_RESPONSE.id);
    expect(find('cancellation-form')).toBeNull();
    http.expectNone(`${BASE}/cancelaciones`);
  });

  it('keeps the original body and key across ambiguous failure, component recreation and HTTP 200 replay', async () => {
    await setup();
    const first = send();
    const key = first.request.headers.get('Idempotency-Key');
    const body = first.request.body;
    first.flush({ code: 'servicio_no_disponible' }, { status: 503, statusText: 'Unavailable' });
    render();
    expect(find('cancellation-result')).toBeNull();
    expect(find('cancellation-settlement')).toBeNull();
    expect(find('cancellation-notice')?.textContent).toContain(
      es.policyCancellation.errors.ambiguous,
    );
    fixture.destroy();
    fixture = TestBed.createComponent(PolicyCancellationPageComponent);
    render();
    http.expectOne(`${BASE}/cancelacion`).flush({
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: 'd'.repeat(64) },
    });
    render();
    expect(find('cancellation-form')).toBeNull();
    expect(find('cancellation-settlement')).toBeNull();
    button('cancellation-retry').click();
    const replay = http.expectOne(`${BASE}/cancelaciones`);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(key);
    expect(replay.request.body).toEqual(body);
    replay.flush(CANCELLATION_RESULT_RESPONSE, { status: 200, statusText: 'OK' });
    render();
    expect(find('cancellation-result')).not.toBeNull();
    expect(find('cancellation-notice')).toBeNull();
  });

  it('requires fresh acceptance and a new key after a changed settlement', async () => {
    await setup();
    const first = send();
    const key = first.request.headers.get('Idempotency-Key');
    first.flush({ code: 'liquidacion_cambio' }, { status: 409, statusText: 'Conflict' });
    const newHash = 'd'.repeat(64);
    http.expectOne(`${BASE}/cancelacion`).flush({
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: {
        ...SETTLEMENT_RESPONSE,
        liquidacionHash: newHash,
        devolucion: { monto: '41000', moneda: 'COP' },
      },
    });
    render();
    expect(find('cancellation-notice')?.textContent).toContain(
      es.policyCancellation.errors['settlement-changed'],
    );
    expect(find('cancellation-refund')?.textContent).toContain('41.000');
    expect(button('cancellation-confirm').disabled).toBe(true);
    const second = send();
    expect(second.request.headers.get('Idempotency-Key')).not.toBe(key);
    expect(second.request.body.liquidacionHash).toBe(newHash);
    second.flush(
      {
        ...CANCELLATION_RESULT_RESPONSE,
        liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: newHash },
      },
      { status: 201, statusText: 'Created' },
    );
  });

  it('reloads ineligibility after a 422 rejection without reusing the stale settlement', async () => {
    await setup();
    send().flush(
      { code: 'poliza_no_cancelable', motivo: 'renovacion_en_curso' },
      { status: 422, statusText: 'Unprocessable' },
    );
    http.expectOne(`${BASE}/cancelacion`).flush({
      ...CANCELLATION_STATE_RESPONSE,
      cancelable: false,
      motivo: 'renovacion_en_curso',
      liquidacion: null,
    });
    render();
    expect(find('cancellation-form')).toBeNull();
    expect(find('cancellation-ineligible')?.textContent).toContain(
      es.policyCancellation.ineligible.renovacion_en_curso,
    );
  });

  it.each([
    [403, 'alcance_insuficiente', 'forbidden'],
    [404, 'poliza_no_encontrada', 'not-found'],
    [409, 'idempotencia_conflictiva', 'key-conflict'],
  ] as const)('blocks resubmission for HTTP %s %s', async (status, code, kind) => {
    await setup();
    send().flush({ code }, { status, statusText: 'Rejected' });
    render();
    expect(find('cancellation-notice')?.textContent).toContain(es.policyCancellation.errors[kind]);
    expect(button('cancellation-retry').disabled).toBe(true);
    expect(find('cancellation-result')).toBeNull();
  });

  it('does not treat an invalid success payload as confirmation or replace its attempt key', async () => {
    await setup();
    const first = send();
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(
      { ...CANCELLATION_RESULT_RESPONSE, simulada: false },
      { status: 201, statusText: 'Created' },
    );
    render();
    expect(find('cancellation-result')).toBeNull();
    button('cancellation-retry').click();
    const second = http.expectOne(`${BASE}/cancelaciones`);
    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    second.flush(CANCELLATION_RESULT_RESPONSE, { status: 200, statusText: 'OK' });
  });

  it('blocks submission when recovery storage cannot be written', async () => {
    await setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    accept();
    fixture.componentInstance.confirm();
    render();
    http.expectNone(`${BASE}/cancelaciones`);
    expect(find('cancellation-notice')?.textContent).toContain(
      es.policyCancellation.errors.storage,
    );
    expect(button('cancellation-confirm').disabled).toBe(true);
  });

  it('recovers a completed cancellation by GET after an ambiguous submission', async () => {
    await setup();
    send().flush({ code: 'servicio_no_disponible' }, { status: 503, statusText: 'Unavailable' });
    render();
    button('cancellation-reload').click();
    http.expectOne(`${BASE}/cancelacion`).flush(CANCELLED_STATE_RESPONSE);
    render();
    expect(find('cancellation-result')?.textContent).toContain(CANCELLATION_RESULT_RESPONSE.id);
    expect(find('cancellation-notice')).toBeNull();
    expect(find('cancellation-pending')).toBeNull();
    http.expectNone(`${BASE}/cancelaciones`);
  });

  it.each([
    [403, 'alcance_insuficiente', 'forbidden'],
    [404, 'poliza_no_encontrada', 'not-found'],
  ] as const)(
    'shows state access rejection %s without cancellation controls',
    async (status, code, kind) => {
      await setup();
      fixture.componentInstance.load();
      http.expectOne(`${BASE}/cancelacion`).flush({ code }, { status, statusText: 'Rejected' });
      render();
      expect(find('cancellation-notice')?.textContent).toContain(
        es.policyCancellation.errors[kind],
      );
      expect(find('cancellation-form')).toBeNull();
    },
  );

  it('rejects invalid identifiers without an HTTP call', async () => {
    await setup({}, 'invalid-id');
    expect(root().textContent).toContain(es.policyCancellation.invalid);
  });

  it('cancels the previous policy request on parameter changes', async () => {
    await setup();
    fixture.componentInstance.load();
    const previous = http.expectOne(`${BASE}/cancelacion`);
    params.next(convertToParamMap({ policyId: 'not-an-id' }));
    render();
    expect(previous.cancelled).toBe(true);
    expect(find('cancellation-settlement')).toBeNull();
  });

  it('cancels superseded refreshes so an older state cannot replace the latest read', async () => {
    await setup();
    fixture.componentInstance.load();
    const previous = http.expectOne(`${BASE}/cancelacion`);
    fixture.componentInstance.load();
    expect(previous.cancelled).toBe(true);
    http.expectOne(`${BASE}/cancelacion`).flush(CANCELLED_STATE_RESPONSE);
    render();
    expect(find('cancellation-result')).not.toBeNull();
    expect(find('cancellation-form')).toBeNull();
  });

  it('isolates pending requests and displayed results when the client changes', async () => {
    await setup();
    const previous = send();
    user.set({ id: 'another-client' });
    render();
    expect(previous.cancelled).toBe(true);
    http.expectOne(`${BASE}/cancelacion`).flush(CANCELLATION_STATE_RESPONSE);
    render();
    expect(find('cancellation-pending')).toBeNull();
    expect(find('cancellation-result')).toBeNull();
    expect(button('cancellation-confirm').disabled).toBe(true);
  });

  it('renders the English flow and formats integer COP amounts without losing precision', async () => {
    await setup();
    TestBed.inject(TranslocoService).setActiveLang('en');
    render();
    expect(root().textContent).toContain(en.policyCancellation.title);
    expect(fixture.componentInstance.money('9999999999999999')).toContain('9,999,999,999,999,999');
  });
});

import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { POLICY_MODIFICATION_GATEWAY } from '../../core/policies/policy-modification.gateway';
import {
  IMPACT_HASH,
  IMPACT_RESPONSE,
  MODIFICATION_POLICY_ID,
  MODIFICATION_RESULT_RESPONSE,
  MODIFICATION_STATE_RESPONSE,
  NOT_MODIFIABLE_RESPONSE,
  VERSION_1,
  VERSION_2,
} from '../../core/policies/policy-modification.testing';
import { problem } from '../../core/policies/policy-renewal.testing';
import { HttpPolicyModificationGateway } from '../../data-access/policies/http-policy-modification.gateway';
import { PolicyModificationPageComponent } from './policy-modification-page.component';

registerLocaleData(localeEsCo);
const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${MODIFICATION_POLICY_ID}`;

describe('PolicyModificationPageComponent with HTTP consumer', () => {
  let fixture: ComponentFixture<PolicyModificationPageComponent>;
  let http: HttpTestingController;
  const params = new BehaviorSubject(convertToParamMap({ policyId: '' }));
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const find = (testId: string) => root().querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const render = () => fixture.detectChanges();
  const button = (testId: string) => find(testId) as HTMLButtonElement;
  const click = (selector: string) => {
    root().querySelector<HTMLElement>(selector)?.click();
    render();
  };

  async function setup(policyId: string, state: object = MODIFICATION_STATE_RESPONSE) {
    params.next(convertToParamMap({ policyId }));
    await TestBed.configureTestingModule({
      imports: [
        PolicyModificationPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: POLICY_MODIFICATION_GATEWAY, useClass: HttpPolicyModificationGateway },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyModificationPageComponent);
    http = TestBed.inject(HttpTestingController);
    render();
    if (policyId === MODIFICATION_POLICY_ID) {
      http.expectOne(`${BASE}/modificacion`).flush(state);
      render();
    }
  }

  /** Elige plan premium y retira la cobertura opcional: la propuesta del impacto de prueba. */
  function proposePremiumWithoutAssistance(): void {
    click('[data-testid="plan-premium"] input');
    click('[data-testid="optional-asistencia_carretera"] input');
  }

  function simulate(): void {
    proposePremiumWithoutAssistance();
    click('[data-testid="modification-simulate"]');
    const request = http.expectOne(`${BASE}/modificaciones/simulacion`);
    expect(request.request.body).toEqual({
      versionBase: 1,
      plan: 'premium',
      coberturasOpcionales: [],
    });
    request.flush(IMPACT_RESPONSE);
    render();
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('enables only the plan and optional coverages allowed by the backend', async () => {
    await setup(MODIFICATION_POLICY_ID);

    expect(find('modification-current')?.textContent).toContain('85.000');
    expect(find('plan-integral')).not.toBeNull();
    expect(find('optional-asistencia_carretera')).not.toBeNull();
    expect(find('optional-danos_vehiculo')).toBeNull();
    expect(button('modification-simulate').disabled).toBe(true);
  });

  it('explains why a policy cannot be modified', async () => {
    await setup(MODIFICATION_POLICY_ID, NOT_MODIFIABLE_RESPONSE);

    expect(find('modification-form')).toBeNull();
    expect(find('modification-not-modifiable')?.textContent).toContain(
      es.policyModification.reasons.poliza_vencida,
    );
  });

  it('cancels old confirmations and clears their proposal when the policy changes', async () => {
    await setup(MODIFICATION_POLICY_ID);
    simulate();
    fixture.componentInstance.toggleConfirmation(true);
    fixture.componentInstance.confirm();
    const old = http.expectOne(`${BASE}/modificaciones`);
    const key = old.request.headers.get('Idempotency-Key');
    const nextId = '80000000-0000-4000-8000-000000000002';
    params.next(convertToParamMap({ policyId: nextId }));
    render();
    expect(old.cancelled).toBe(true);
    expect(fixture.componentInstance.impact()).toBeNull();
    expect(fixture.componentInstance.confirmed()).toBe(false);
    expect(fixture.componentInstance.modification()).toBeNull();
    expect(fixture.componentInstance.busy()).toBe(false);
    const next = http.expectOne(
      `${environment.apiBaseUrl}/v1/clientes/me/polizas/${nextId}/modificacion`,
    );
    next.flush({ ...NOT_MODIFIABLE_RESPONSE, polizaId: nextId });
    render();
    expect(find('modification-form')).toBeNull();
    expect(fixture.componentInstance.outcome()).toBeNull();

    params.next(convertToParamMap({ policyId: MODIFICATION_POLICY_ID }));
    http.expectOne(`${BASE}/modificacion`).flush(MODIFICATION_STATE_RESPONSE);
    render();
    simulate();
    fixture.componentInstance.toggleConfirmation(true);
    fixture.componentInstance.confirm();
    const retry = http.expectOne(`${BASE}/modificaciones`);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(MODIFICATION_RESULT_RESPONSE);
    render();
  });

  it('cancels an old state query even when navigating to an invalid policy', async () => {
    await setup(MODIFICATION_POLICY_ID);
    fixture.componentInstance.load();
    const old = http.expectOne(`${BASE}/modificacion`);
    params.next(convertToParamMap({ policyId: 'invalid' }));
    render();
    expect(old.cancelled).toBe(true);
    expect(fixture.componentInstance.state()).toBe('invalid');
    expect(fixture.componentInstance.modification()).toBeNull();
  });

  it('shows the returned impact and requires explicit confirmation', async () => {
    await setup(MODIFICATION_POLICY_ID);
    simulate();

    expect(find('impact-new-premium')?.textContent).toContain('100.100');
    expect(find('impact-adjustment')?.textContent).toContain('12.665');
    expect(find('impact-removed')?.textContent).toContain('Asistencia en carretera');
    expect(text()).toContain(es.policyModification.periodUnchanged);
    expect(button('modification-confirm').disabled).toBe(true);

    click('[data-testid="plan-integral"] input');
    expect(find('modification-impact')).toBeNull();
  });

  it('confirms once and updates the view with the confirmed version', async () => {
    await setup(MODIFICATION_POLICY_ID);
    simulate();
    click('[data-testid="modification-accept"] input');

    button('modification-confirm').click();
    button('modification-confirm').click();
    render();
    const request = http.expectOne(`${BASE}/modificaciones`);
    expect(request.request.body).toEqual({
      versionBase: 1,
      plan: 'premium',
      coberturasOpcionales: [],
      confirma: true,
      impactoHash: IMPACT_HASH,
    });
    expect(button('modification-confirm').disabled).toBe(true);
    request.flush(MODIFICATION_RESULT_RESPONSE, { status: 201, statusText: 'Created' });
    render();

    expect(find('modification-success')?.textContent).toContain('v2');
    expect(find('modification-current')?.textContent).toContain('100.100');
    expect(find('modification-history')?.textContent).toContain('v1');
    expect(find('modification-impact')).toBeNull();
  });

  it('keeps the confirmed conditions and reloads the version when it is outdated', async () => {
    await setup(MODIFICATION_POLICY_ID);
    simulate();
    click('[data-testid="modification-accept"] input');
    click('[data-testid="modification-confirm"]');
    http
      .expectOne(`${BASE}/modificaciones`)
      .flush(problem(409, 'version_desactualizada', { versionActual: 2 }), {
        status: 409,
        statusText: 'Conflict',
      });
    http.expectOne(`${BASE}/modificacion`).flush({
      ...MODIFICATION_STATE_RESPONSE,
      versionActual: VERSION_2,
      historial: [VERSION_2, VERSION_1],
    });
    render();

    expect(find('modification-rejected')?.textContent).toContain(
      es.policyModification.errors['outdated-version'],
    );
    expect(find('modification-current')?.textContent).toContain('v2');
    expect(find('modification-impact')).toBeNull();
  });

  it('reuses the same key after an unconfirmed response without showing changes', async () => {
    await setup(MODIFICATION_POLICY_ID);
    simulate();
    click('[data-testid="modification-accept"] input');
    click('[data-testid="modification-confirm"]');
    const first = http.expectOne(`${BASE}/modificaciones`);
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(problem(503, 'servicio_no_disponible'), {
      status: 503,
      statusText: 'Unavailable',
    });
    render();

    expect(find('modification-unconfirmed')).not.toBeNull();
    expect(find('modification-current')?.textContent).toContain('85.000');
    click('[data-testid="modification-confirm"]');
    expect(http.expectOne(`${BASE}/modificaciones`).request.headers.get('Idempotency-Key')).toBe(
      key,
    );
  });

  it('shows a business rejection from the simulation', async () => {
    await setup(MODIFICATION_POLICY_ID);
    proposePremiumWithoutAssistance();
    click('[data-testid="modification-simulate"]');
    http
      .expectOne(`${BASE}/modificaciones/simulacion`)
      .flush(problem(422, 'cambio_no_permitido', { campo: 'coberturasOpcionales.x' }), {
        status: 422,
        statusText: 'Unprocessable',
      });
    render();

    expect(find('modification-rejected')?.textContent).toContain(
      es.policyModification.errors['not-allowed'],
    );
  });

  it('rejects invalid policy identifiers without calling the backend', async () => {
    await setup('no-es-uuid');
    expect(text()).toContain(es.policyModification.invalid);
  });
});

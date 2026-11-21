import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { POLICY_RENEWAL_GATEWAY } from '../../core/policies/policy-renewal.gateway';
import {
  CONDITIONS_HASH,
  ELIGIBILITY_RESPONSE,
  NOT_RENEWABLE_RESPONSE,
  problem,
  RENEWAL_POLICY_ID,
  renewalResponse,
} from '../../core/policies/policy-renewal.testing';
import { HttpPolicyRenewalGateway } from '../../data-access/policies/http-policy-renewal.gateway';
import { PolicyRenewalPageComponent } from './policy-renewal-page.component';

registerLocaleData(localeEsCo);
const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${RENEWAL_POLICY_ID}`;

describe('PolicyRenewalPageComponent with HTTP consumer', () => {
  let fixture: ComponentFixture<PolicyRenewalPageComponent>;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(TEST_USER);
  const params = new BehaviorSubject(convertToParamMap({ policyId: '' }));
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const find = (testId: string) => root().querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const render = () => fixture.detectChanges();
  const confirmButton = () => find('renewal-confirm') as HTMLButtonElement;
  const accept = () => {
    root().querySelector<HTMLInputElement>('[data-testid="renewal-accept"] input')?.click();
    render();
  };

  async function setup(policyId: string, eligibility: object = ELIGIBILITY_RESPONSE) {
    params.next(convertToParamMap({ policyId }));
    await TestBed.configureTestingModule({
      imports: [
        PolicyRenewalPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
        { provide: POLICY_RENEWAL_GATEWAY, useClass: HttpPolicyRenewalGateway },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyRenewalPageComponent);
    http = TestBed.inject(HttpTestingController);
    render();
    if (policyId === RENEWAL_POLICY_ID) {
      http.expectOne(`${BASE}/renovacion`).flush(eligibility);
      render();
    }
  }

  beforeEach(() => {
    sessionStorage.clear();
    user.set(TEST_USER);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows new term, coverages, premium and conditions before confirming', async () => {
    await setup(RENEWAL_POLICY_ID);

    expect(find('renewal-new-period')?.textContent).toContain('2027');
    expect(find('renewal-premium')?.textContent).toContain('25.000');
    expect(find('renewal-coverages')?.textContent).toContain('Fallecimiento');
    expect(text()).toContain('La información de salud declarada');
    expect(text()).toContain(es.policyRenewal.paymentNote);
    expect(confirmButton().disabled).toBe(true);
  });

  it('disables renewal and explains the backend reason when it is not eligible', async () => {
    await setup(RENEWAL_POLICY_ID, NOT_RENEWABLE_RESPONSE);

    expect(find('renewal-offer')).toBeNull();
    expect(find('renewal-not-renewable')?.textContent).toContain(
      es.policyRenewal.reasons.fuera_de_ventana,
    );
  });

  it('cancels an old renewal without losing its recovery key when navigating away', async () => {
    await setup(RENEWAL_POLICY_ID);
    accept();
    fixture.componentInstance.confirm();
    const old = http.expectOne(`${BASE}/renovaciones`);
    const key = old.request.headers.get('Idempotency-Key');
    const nextId = '80000000-0000-4000-8000-000000000002';
    params.next(convertToParamMap({ policyId: nextId }));
    render();
    expect(old.cancelled).toBe(true);
    expect(fixture.componentInstance.eligibility()).toBeNull();
    expect(fixture.componentInstance.accepted()).toBe(false);
    expect(fixture.componentInstance.submitting()).toBe(false);
    const next = http.expectOne(
      `${environment.apiBaseUrl}/v1/clientes/me/polizas/${nextId}/renovacion`,
    );
    next.flush({ ...NOT_RENEWABLE_RESPONSE, polizaId: nextId });
    render();
    expect(fixture.componentInstance.outcome()).toBeNull();

    params.next(convertToParamMap({ policyId: RENEWAL_POLICY_ID }));
    http.expectOne(`${BASE}/renovacion`).flush(ELIGIBILITY_RESPONSE);
    render();
    fixture.componentInstance.confirm();
    const retry = http.expectOne(`${BASE}/renovaciones`);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(renewalResponse('pendiente'));
    render();
  });

  it('cancels a pending eligibility query when navigating to an invalid policy', async () => {
    await setup(RENEWAL_POLICY_ID);
    fixture.componentInstance.load();
    const old = http.expectOne(`${BASE}/renovacion`);
    params.next(convertToParamMap({ policyId: 'invalid' }));
    render();
    expect(old.cancelled).toBe(true);
    expect(fixture.componentInstance.state()).toBe('invalid');
    expect(fixture.componentInstance.eligibility()).toBeNull();
  });

  it('requires explicit acceptance and sends a single request while processing', async () => {
    await setup(RENEWAL_POLICY_ID);
    accept();
    expect(confirmButton().disabled).toBe(false);

    confirmButton().click();
    confirmButton().click();
    render();
    const request = http.expectOne(`${BASE}/renovaciones`);
    expect(request.request.body).toEqual({
      aceptaCondiciones: true,
      condicionesHash: CONDITIONS_HASH,
    });
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(confirmButton().disabled).toBe(true);
    expect(confirmButton().textContent).toContain(es.policyRenewal.processing);

    request.flush(renewalResponse('renovada'), { status: 201, statusText: 'Created' });
    render();
    http.expectOne(`${BASE}/renovacion`).flush(NOT_RENEWABLE_RESPONSE);
    render();
    expect(find('renewal-success')?.textContent).toContain(es.policyRenewal.outcomes.renewed);
    expect(find('renewal-success')?.textContent).toContain('2027');
  });

  it('keeps the original conditions visible when the payment is declined', async () => {
    await setup(RENEWAL_POLICY_ID);
    accept();
    confirmButton().click();
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(renewalResponse('rechazada'), { status: 201, statusText: 'Created' });
    render();

    expect(find('renewal-rejected')?.textContent).toContain(es.policyRenewal.outcomes.rejected);
    expect(find('renewal-success')).toBeNull();
    expect(find('renewal-current')?.textContent).toContain('2026');
    expect(find('renewal-offer')).not.toBeNull();
  });

  it('reuses the same key to check an unconfirmed renewal instead of creating another', async () => {
    await setup(RENEWAL_POLICY_ID);
    accept();
    confirmButton().click();
    const first = http.expectOne(`${BASE}/renovaciones`);
    const key = first.request.headers.get('Idempotency-Key');
    first.flush(problem(503, 'servicio_no_disponible'), { status: 503, statusText: 'Unavailable' });
    render();
    expect(find('renewal-unconfirmed')).not.toBeNull();
    expect(find('renewal-success')).toBeNull();

    find('renewal-check')?.click();
    const retry = http.expectOne(`${BASE}/renovaciones`);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(renewalResponse('pendiente'), { status: 202, statusText: 'Accepted' });
    render();
    expect(find('renewal-pending')?.textContent).toContain(es.policyRenewal.outcomes.pending);

    find('renewal-check')?.click();
    const last = http.expectOne(`${BASE}/renovaciones`);
    expect(last.request.headers.get('Idempotency-Key')).toBe(key);
  });

  it('reloads the offer when the conditions changed', async () => {
    await setup(RENEWAL_POLICY_ID);
    accept();
    confirmButton().click();
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(problem(409, 'condiciones_cambiaron'), { status: 409, statusText: 'Conflict' });
    http.expectOne(`${BASE}/renovacion`).flush(ELIGIBILITY_RESPONSE);
    render();

    expect(text()).toContain(es.policyRenewal.outcomes.conditionsChanged);
    expect(confirmButton().disabled).toBe(true);
  });

  it('rejects invalid policy identifiers without calling the backend', async () => {
    await setup('no-es-uuid');
    expect(text()).toContain(es.policyRenewal.invalid);
  });
});

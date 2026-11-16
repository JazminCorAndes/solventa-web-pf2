import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { PolicyRenewalError } from '../../core/policies/policy-renewal.models';
import {
  CONDITIONS_HASH,
  ELIGIBILITY_RESPONSE,
  NOT_RENEWABLE_RESPONSE,
  problem,
  RENEWAL_POLICY_ID,
  renewalResponse,
} from '../../core/policies/policy-renewal.testing';
import { HttpPolicyRenewalGateway } from './http-policy-renewal.gateway';

const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${RENEWAL_POLICY_ID}`;
const KEY = '1f2e3d4c-5b6a-4789-8abc-def012345678';

describe('HttpPolicyRenewalGateway', () => {
  let gateway: HttpPolicyRenewalGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('renewal-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpPolicyRenewalGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpPolicyRenewalGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the eligibility of the session client with JWT and maps the offer', async () => {
    const result = firstValueFrom(gateway.eligibility(RENEWAL_POLICY_ID));
    const request = http.expectOne(`${BASE}/renovacion`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer renewal-test-token');
    request.flush(ELIGIBILITY_RESPONSE);

    const eligibility = await result;
    expect(eligibility.renewable).toBe(true);
    expect(eligibility.offer?.newPeriod).toEqual({ start: '2026-12-12', end: '2027-01-12' });
    expect(eligibility.offer?.premium.amount).toBe('25000');
    expect(eligibility.offer?.coverages).toHaveLength(2);
    expect(eligibility.window).toEqual({ from: '2026-11-26', to: '2026-12-11' });
  });

  it('accepts a non renewable policy with its reason and no offer', async () => {
    const result = firstValueFrom(gateway.eligibility(RENEWAL_POLICY_ID));
    http.expectOne(`${BASE}/renovacion`).flush(NOT_RENEWABLE_RESPONSE);
    const eligibility = await result;
    expect(eligibility.reason).toBe('fuera_de_ventana');
    expect(eligibility.offer).toBeNull();
  });

  it.each([
    [{ ...ELIGIBILITY_RESPONSE, polizaId: '00000000-0000-4000-8000-000000000000' }],
    [{ ...ELIGIBILITY_RESPONSE, renovable: false }],
    [{ ...NOT_RENEWABLE_RESPONSE, motivo: 'otro' }],
    [{ ...ELIGIBILITY_RESPONSE, oferta: { ...ELIGIBILITY_RESPONSE.oferta, condicionesHash: 'x' } }],
  ])('rejects incoherent eligibility responses', async (body) => {
    const result = firstValueFrom(gateway.eligibility(RENEWAL_POLICY_ID));
    http.expectOne(`${BASE}/renovacion`).flush(body);
    await expect(result).rejects.toThrow('invalid');
  });

  it('sends explicit acceptance with the idempotency key and maps the result', async () => {
    const result = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    const request = http.expectOne(`${BASE}/renovaciones`);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe(KEY);
    expect(request.request.body).toEqual({
      aceptaCondiciones: true,
      condicionesHash: CONDITIONS_HASH,
    });
    request.flush(renewalResponse('renovada'), { status: 201, statusText: 'Created' });

    const submission = await result;
    expect(submission.replayed).toBe(false);
    expect(submission.renewal.state).toBe('renovada');
  });

  it('distinguishes a replay and a pending result', async () => {
    const replay = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    http.expectOne(`${BASE}/renovaciones`).flush(renewalResponse('rechazada'));
    expect((await replay).replayed).toBe(true);

    const pending = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(renewalResponse('pendiente'), { status: 202, statusText: 'Accepted' });
    expect((await pending).renewal.state).toBe('pendiente');
  });

  it('does not accept a confirmation for other conditions or an incoherent status', async () => {
    const other = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, 'd'.repeat(64), KEY));
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(renewalResponse('renovada'), { status: 201, statusText: 'Created' });
    await expect(other).rejects.toThrow('invalid');

    const incoherent = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(renewalResponse('renovada'), { status: 202, statusText: 'Accepted' });
    await expect(incoherent).rejects.toThrow('invalid');
  });

  it.each([
    [404, 'poliza_no_encontrada', {}, 'not-found'],
    [422, 'poliza_no_renovable', { motivo: 'poliza_vencida' }, 'not-renewable'],
    [409, 'condiciones_cambiaron', {}, 'conditions-changed'],
    [409, 'renovacion_en_curso', { renovacionId: 'abc' }, 'in-progress'],
    [409, 'idempotencia_conflictiva', {}, 'key-conflict'],
  ])('translates %s %s into a business error', async (status, code, extra, kind) => {
    const result = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(problem(status, code, extra), { status, statusText: 'Error' });
    const error = await result.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(PolicyRenewalError);
    expect((error as PolicyRenewalError).kind).toBe(kind);
  });

  it('keeps unavailability as a technical error', async () => {
    const result = firstValueFrom(gateway.renew(RENEWAL_POLICY_ID, CONDITIONS_HASH, KEY));
    http
      .expectOne(`${BASE}/renovaciones`)
      .flush(problem(503, 'servicio_no_disponible'), { status: 503, statusText: 'Unavailable' });
    const error = await result.catch((failure: unknown) => failure);
    expect(error).not.toBeInstanceOf(PolicyRenewalError);
  });
});

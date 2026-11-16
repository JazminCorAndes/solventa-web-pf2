import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import {
  ModificationProposal,
  PolicyModificationError,
} from '../../core/policies/policy-modification.models';
import {
  IMPACT_HASH,
  IMPACT_RESPONSE,
  MODIFICATION_POLICY_ID,
  MODIFICATION_RESULT_RESPONSE,
  MODIFICATION_STATE_RESPONSE,
  NOT_MODIFIABLE_RESPONSE,
  VERSION_1,
} from '../../core/policies/policy-modification.testing';
import { problem } from '../../core/policies/policy-renewal.testing';
import { HttpPolicyModificationGateway } from './http-policy-modification.gateway';

const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${MODIFICATION_POLICY_ID}`;
const KEY = '2a3b4c5d-6e7f-4801-9abc-def012345678';
const PROPOSAL: ModificationProposal = { baseVersion: 1, plan: 'premium', optionalCoverages: [] };

describe('HttpPolicyModificationGateway', () => {
  let gateway: HttpPolicyModificationGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('modification-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpPolicyModificationGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpPolicyModificationGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current version, options and history with the session JWT', async () => {
    const result = firstValueFrom(gateway.state(MODIFICATION_POLICY_ID));
    const request = http.expectOne(`${BASE}/modificacion`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer modification-test-token');
    request.flush(MODIFICATION_STATE_RESPONSE);

    const state = await result;
    expect(state.currentVersion?.plan).toBe('esencial');
    expect(state.options?.optionalCoverages[0].surcharge.amount).toBe('8000');
    expect(state.history).toHaveLength(1);
  });

  it('accepts a non modifiable policy with its reason', async () => {
    const result = firstValueFrom(gateway.state(MODIFICATION_POLICY_ID));
    http.expectOne(`${BASE}/modificacion`).flush(NOT_MODIFIABLE_RESPONSE);
    expect((await result).reason).toBe('poliza_vencida');
  });

  it.each([
    [{ ...MODIFICATION_STATE_RESPONSE, modificable: false }],
    [{ ...MODIFICATION_STATE_RESPONSE, historial: [] }],
    [{ ...MODIFICATION_STATE_RESPONSE, historial: [VERSION_1, VERSION_1] }],
    [{ ...MODIFICATION_STATE_RESPONSE, polizaId: '00000000-0000-4000-8000-000000000000' }],
  ])('rejects incoherent states', async (body) => {
    const result = firstValueFrom(gateway.state(MODIFICATION_POLICY_ID));
    http.expectOne(`${BASE}/modificacion`).flush(body);
    await expect(result).rejects.toThrow('invalid');
  });

  it('simulates only the allowed fields and validates the impact', async () => {
    const result = firstValueFrom(gateway.simulate(MODIFICATION_POLICY_ID, PROPOSAL));
    const request = http.expectOne(`${BASE}/modificaciones/simulacion`);
    expect(request.request.body).toEqual({
      versionBase: 1,
      plan: 'premium',
      coberturasOpcionales: [],
    });
    request.flush(IMPACT_RESPONSE);
    const impact = await result;
    expect(impact.newPremium.amount).toBe('100100');
    expect(impact.removed).toEqual(['asistencia_carretera']);
  });

  it('rejects an impact whose difference does not match the premiums', async () => {
    const result = firstValueFrom(gateway.simulate(MODIFICATION_POLICY_ID, PROPOSAL));
    http
      .expectOne(`${BASE}/modificaciones/simulacion`)
      .flush({ ...IMPACT_RESPONSE, diferenciaMensual: { monto: '1', moneda: 'COP' } });
    await expect(result).rejects.toThrow('invalid');
  });

  it('confirms with explicit confirmation, impact hash and idempotency key', async () => {
    const result = firstValueFrom(
      gateway.confirm(MODIFICATION_POLICY_ID, PROPOSAL, IMPACT_HASH, KEY),
    );
    const request = http.expectOne(`${BASE}/modificaciones`);
    expect(request.request.headers.get('Idempotency-Key')).toBe(KEY);
    expect(request.request.body).toEqual({
      versionBase: 1,
      plan: 'premium',
      coberturasOpcionales: [],
      confirma: true,
      impactoHash: IMPACT_HASH,
    });
    request.flush(MODIFICATION_RESULT_RESPONSE, { status: 201, statusText: 'Created' });
    const confirmed = await result;
    expect(confirmed.newVersion).toBe(2);
    expect(confirmed.version.plan).toBe('premium');
  });

  it('does not accept a confirmation for another impact', async () => {
    const result = firstValueFrom(
      gateway.confirm(MODIFICATION_POLICY_ID, PROPOSAL, 'f'.repeat(64), KEY),
    );
    http
      .expectOne(`${BASE}/modificaciones`)
      .flush(MODIFICATION_RESULT_RESPONSE, { status: 201, statusText: 'Created' });
    await expect(result).rejects.toThrow('invalid');
  });

  it.each([
    [404, 'poliza_no_encontrada', {}, 'not-found'],
    [422, 'poliza_no_modificable', { motivo: 'fin_de_vigencia' }, 'not-modifiable'],
    [422, 'cambio_no_permitido', { campo: 'coberturasOpcionales.x' }, 'not-allowed'],
    [422, 'sin_cambios', {}, 'no-changes'],
    [409, 'version_desactualizada', { versionActual: 2 }, 'outdated-version'],
    [409, 'impacto_cambio', {}, 'impact-changed'],
    [409, 'idempotencia_conflictiva', {}, 'key-conflict'],
  ])('translates %s %s into a business error', async (status, code, extra, kind) => {
    const result = firstValueFrom(
      gateway.confirm(MODIFICATION_POLICY_ID, PROPOSAL, IMPACT_HASH, KEY),
    );
    http
      .expectOne(`${BASE}/modificaciones`)
      .flush(problem(status, code, extra), { status, statusText: 'Error' });
    const error = await result.catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(PolicyModificationError);
    expect((error as PolicyModificationError).kind).toBe(kind);
  });
});

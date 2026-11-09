import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { ClaimNotFoundError } from '../../core/claims/claim-status.errors';
import {
  CLAIM_ID,
  CLAIM_NOT_FOUND_PROBLEM,
  CLAIM_STATUS,
  CLAIM_STATUS_RESPONSE,
} from '../../core/claims/claim-status.testing';
import { HttpClaimStatusGateway } from './http-claim-status.gateway';

const URL = `${environment.apiBaseUrl}/v1/clientes/me/siniestros/${CLAIM_ID}`;

describe('HttpClaimStatusGateway', () => {
  let gateway: HttpClaimStatusGateway;
  let http: HttpTestingController;
  const auth = { getAccessToken: vi.fn(), renewAccessToken: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getAccessToken.mockReturnValue(of('claim-test-token'));
    auth.renewAccessToken.mockReturnValue(of('renewed-claim-test-token'));
    TestBed.configureTestingModule({
      providers: [
        HttpClaimStatusGateway,
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    gateway = TestBed.inject(HttpClaimStatusGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('queries the session client claim with JWT and without a client ID', async () => {
    const result = firstValueFrom(gateway.load(CLAIM_ID));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.headers.get('Authorization')).toBe('Bearer claim-test-token');
    request.flush(CLAIM_STATUS_RESPONSE);
    await expect(result).resolves.toEqual(CLAIM_STATUS);
  });

  it('maps an unavailable claim to a domain error without exposing details', async () => {
    const result = firstValueFrom(gateway.load(CLAIM_ID));
    http.expectOne(URL).flush(CLAIM_NOT_FOUND_PROBLEM, { status: 404, statusText: 'Not Found' });
    await expect(result).rejects.toBeInstanceOf(ClaimNotFoundError);
  });

  it('preserves an explicitly unclassified claim without inventing a type', async () => {
    const result = firstValueFrom(gateway.load(CLAIM_ID));
    http.expectOne(URL).flush({ ...CLAIM_STATUS_RESPONSE, tipo: null });
    await expect(result).resolves.toEqual({ ...CLAIM_STATUS, type: null });
  });

  it.each([
    [404, { code: 'otra_ruta' }],
    [503, { code: 'servicio_no_disponible' }],
  ])('keeps a %s failure as a technical error', async (status, body) => {
    const result = firstValueFrom(gateway.load(CLAIM_ID));
    http.expectOne(URL).flush(body, { status, statusText: 'Error' });
    await expect(result).rejects.not.toBeInstanceOf(ClaimNotFoundError);
  });

  it.each([
    ['unknown state', { estado: 'inventado' }],
    ['unknown type', { tipo: 'otro' }],
    ['missing type', { tipo: undefined }],
    ['empty history', { historial: [] }],
    ['current state outside history', { estado: 'aprobado' }],
    ['update date outside history', { actualizadoEn: '2026-11-01T19:00:00Z' }],
    ['another claim', { id: '00000000-0000-4000-8000-000000000000' }],
    ['date without zone', { reportadoEn: '2026-11-01T15:00:00' }],
  ])('rejects a response with %s instead of showing it as valid', async (_, overrides) => {
    const result = firstValueFrom(gateway.load(CLAIM_ID));
    http.expectOne(URL).flush({ ...CLAIM_STATUS_RESPONSE, ...overrides });
    await expect(result).rejects.toThrow('The claim status response is invalid.');
  });
});

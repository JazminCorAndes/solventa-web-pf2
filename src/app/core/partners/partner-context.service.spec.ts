import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AUTH_GATEWAY } from '../auth/auth.gateway';
import { AUTH_STORAGE } from '../auth/auth-storage.service';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthService } from '../auth/auth.service';
import { grantFor, TestAuthGateway, TestAuthStorage } from '../auth/auth.testing';
import {
  PartnerAccessError,
  PartnerContextService,
  partnerErrorReason,
} from './partner-context.service';

const URL = `${environment.apiBaseUrl}/v1/socios/actual`;
const CONTEXT = {
  apiVersion: '1',
  usuario: {
    id: 'client-001',
    nombre: 'Socio',
    correo: 'socio@example.com',
    rol: 'socio',
    socios: ['BANCO-001'],
  },
  socios: [{ socioId: 'BANCO-001', productos: ['mortgage-life'] }],
  alcances: ['perfilamientos:crear'],
};

describe('PartnerContextService', () => {
  let http: HttpTestingController;
  let service: PartnerContextService;
  let auth: AuthService;
  let gateway: TestAuthGateway;

  beforeEach(async () => {
    gateway = new TestAuthGateway();
    gateway.loginResult = gateway.refreshResult = () => {
      const grant = grantFor('partner-access', 'partner-refresh');
      grant.session.user = { ...grant.session.user, role: 'partner', partnerIds: ['BANCO-001'] };
      return of(grant);
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AUTH_GATEWAY, useValue: gateway },
        { provide: AUTH_STORAGE, useValue: new TestAuthStorage() },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    await firstValueFrom(auth.login({ email: 'socio@example.com', password: 'secret' }));
    service = TestBed.inject(PartnerContextService);
    TestBed.tick();
  });

  afterEach(() => {
    service.clear();
    http.verify();
    vi.useRealTimers();
  });

  it('uses the authenticated bearer and versioned endpoint without client-supplied tenant', async () => {
    const result = firstValueFrom(service.load());
    const request = http.expectOne(URL);
    expect(request.request.headers.get('API-Version')).toBe('1');
    expect(request.request.headers.has('Authorization')).toBe(true);
    expect(request.request.params.keys()).toEqual([]);
    expect(request.request.body).toBeNull();
    request.flush(CONTEXT);
    await expect(result).resolves.toEqual(CONTEXT);
    expect(service.context()).toEqual(CONTEXT);
  });

  it.each([
    { apiVersion: '2' },
    { usuario: { ...CONTEXT.usuario, id: 'another-user' } },
    { usuario: { ...CONTEXT.usuario, rol: 'asesor' } },
    { socios: [{ socioId: 'OTHER-BANK', productos: ['mortgage-life'] }] },
    { socios: [] },
    { alcances: null },
    { socios: [{ socioId: 'BANCO-001', productos: [12] }] },
  ])('rejects mismatched or incompatible context: %j', async (fields) => {
    const result = firstValueFrom(service.load());
    http.expectOne(URL).flush({ ...CONTEXT, ...fields });
    await expect(result).rejects.toBeInstanceOf(PartnerAccessError);
    expect(service.context()).toBeNull();
  });

  it.each([
    [403, 'forbidden'],
    [429, 'quota'],
    [503, 'unavailable'],
  ])('clears old organization data on HTTP %s without a fallback', async (status, reason) => {
    const initial = firstValueFrom(service.load());
    http.expectOne(URL).flush(CONTEXT);
    await initial;
    const retry = firstValueFrom(service.load()).catch((error: unknown) => error);
    expect(service.context()).toBeNull();
    http.expectOne(URL).flush({}, { status: Number(status), statusText: 'Error' });
    expect(partnerErrorReason(await retry)).toBe(reason);
    expect(service.context()).toBeNull();
  });

  it('discards responses arriving after logout', async () => {
    const result = firstValueFrom(service.load());
    const pending = http.expectOne(URL);
    await firstValueFrom(auth.logout());
    TestBed.tick();
    pending.flush(CONTEXT);
    await expect(result).rejects.toBeInstanceOf(PartnerAccessError);
    expect(service.context()).toBeNull();
  });

  it('never sends a context request for a client', async () => {
    gateway.loginResult = () => of(grantFor('client-access', 'client-refresh'));
    await firstValueFrom(auth.login({ email: 'client@example.com', password: 'secret' }));
    await expect(firstValueFrom(service.load())).rejects.toMatchObject({ reason: 'forbidden' });
    http.expectNone(URL);
  });

  it('removes protected context at token expiration and requires revalidation', async () => {
    vi.useFakeTimers();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = firstValueFrom(service.load());
    http.expectOne(URL).flush(CONTEXT);
    await result;
    vi.advanceTimersByTime(3_600_001);
    expect(service.context()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/acceso-no-disponible'], {
      queryParams: { reason: 'expired' },
    });
  });
});

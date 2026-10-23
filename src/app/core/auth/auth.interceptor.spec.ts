import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, Subject, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InvalidRefreshTokenError } from './auth.errors';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthGrant } from './auth.models';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AUTH_STORAGE } from './auth-storage.service';
import { grantFor, TestAuthGateway, TestAuthStorage } from './auth.testing';

const API = environment.apiBaseUrl;
const PRODUCTS = `${API}/v1/productos-seguro`;
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let gateway: TestAuthGateway;
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    gateway = new TestAuthGateway();
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
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await firstValueFrom(auth.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }));
  });

  afterEach(() => http.verify());

  it('adds the bearer token to protected API calls', () => {
    client.get(PRODUCTS).subscribe();

    const request = http.expectOne(PRODUCTS);

    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });

  it.each([
    ['login', `${API}/v1/sesiones`, 'POST'],
    ['renew', `${API}/v1/sesiones/renovar`, 'POST'],
    ['register', `${API}/v1/usuarios`, 'POST'],
  ])('does not add the token to %s', (_name, url, method) => {
    client.request(method, url, { body: {} }).subscribe();

    const request = http.expectOne(url);

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('adds the token to the current session endpoints', () => {
    client.get(`${API}/v1/sesiones/actual`).subscribe();
    client.delete(`${API}/v1/sesiones/actual`).subscribe();

    for (const request of http.match(`${API}/v1/sesiones/actual`)) {
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
      request.flush({});
    }
  });

  it('does not touch requests outside the API', () => {
    client.get('/assets/i18n/es.json').subscribe();

    const request = http.expectOne('/assets/i18n/es.json');

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('renews once and retries when concurrent requests receive a 401', async () => {
    const pending = new Subject<AuthGrant>();
    gateway.refreshResult = () => pending;
    const results = Promise.all([
      firstValueFrom(client.get(`${PRODUCTS}?a=1`)),
      firstValueFrom(client.get(`${PRODUCTS}?a=2`)),
      firstValueFrom(client.get(`${PRODUCTS}?a=3`)),
    ]);

    for (const request of http.match((r) => r.urlWithParams.startsWith(`${PRODUCTS}?a=`))) {
      request.flush({}, UNAUTHORIZED);
    }
    expect(gateway.refreshCalls).toEqual(['refresh-1']);

    pending.next(grantFor('access-2', 'refresh-2'));
    pending.complete();
    const retries = http.match((r) => r.urlWithParams.startsWith(`${PRODUCTS}?a=`));
    expect(retries).toHaveLength(3);
    for (const retry of retries) {
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
      retry.flush({ ok: true });
    }

    await expect(results).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(gateway.refreshCalls).toEqual(['refresh-1']);
  });

  it('does not renew again when another request already obtained a new token', async () => {
    const first = firstValueFrom(client.get(`${PRODUCTS}?a=1`));
    const second = firstValueFrom(client.get(`${PRODUCTS}?a=2`));
    const [firstRequest, secondRequest] = http.match((r) =>
      r.urlWithParams.startsWith(`${PRODUCTS}?a=`),
    );

    firstRequest.flush({}, UNAUTHORIZED);
    http.expectOne((r) => r.headers.get('Authorization') === 'Bearer access-2').flush({ n: 1 });
    secondRequest.flush({}, UNAUTHORIZED);
    http.expectOne((r) => r.headers.get('Authorization') === 'Bearer access-2').flush({ n: 2 });

    await expect(Promise.all([first, second])).resolves.toEqual([{ n: 1 }, { n: 2 }]);
    expect(gateway.refreshCalls).toEqual(['refresh-1']);
  });

  it('does not retry a second time if the retried request is also rejected', async () => {
    const result = firstValueFrom(client.get(PRODUCTS)).catch((error: unknown) => error);

    http.expectOne(PRODUCTS).flush({}, UNAUTHORIZED);
    http.expectOne(PRODUCTS).flush({}, UNAUTHORIZED);

    await expect(result).resolves.toMatchObject({ status: 401 });
    expect(gateway.refreshCalls).toEqual(['refresh-1']);
    expect(auth.session()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('logs out and redirects to the login when the renewal fails', async () => {
    gateway.refreshResult = () => throwError(() => new InvalidRefreshTokenError());
    const result = firstValueFrom(client.get(PRODUCTS)).catch((error: unknown) => error);

    http.expectOne(PRODUCTS).flush({}, UNAUTHORIZED);

    await expect(result).resolves.toBeInstanceOf(InvalidRefreshTokenError);
    expect(auth.session()).toBeNull();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/iniciar-sesion'], expect.anything());
  });

  it('propagates other HTTP errors without renewing', async () => {
    const result = firstValueFrom(client.get(PRODUCTS)).catch((error: unknown) => error);

    http.expectOne(PRODUCTS).flush({}, { status: 503, statusText: 'Unavailable' });

    await expect(result).resolves.toMatchObject({ status: 503 });
    expect(gateway.refreshCalls).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renews before sending when the stored session has no access token', async () => {
    const storage = new TestAuthStorage();
    storage.stored = {
      user: grantFor('x', 'y').session.user,
      refreshToken: 'refresh-stored',
      refreshExpiresAt: Date.now() + 60_000,
    };
    TestBed.resetTestingModule();
    gateway = new TestAuthGateway();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AUTH_GATEWAY, useValue: gateway },
        { provide: AUTH_STORAGE, useValue: storage },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const restoredClient = TestBed.inject(HttpClient);

    restoredClient.get(PRODUCTS).subscribe();

    const request = http.expectOne(PRODUCTS);
    expect(gateway.refreshCalls).toEqual(['refresh-stored']);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-2');
    request.flush({});
  });
});

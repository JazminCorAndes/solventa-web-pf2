import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { TestAuthStorage } from '../../core/auth/auth.testing';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { HttpAuthGateway } from '../../data-access/auth/http-auth.gateway';

const API = environment.apiBaseUrl;
const USER = {
  id: 'partner-1',
  nombre: 'Socio Uno',
  correo: 'socio@example.com',
  rol: 'socio',
  socios: ['BANCO-001'],
};
const CONTEXT = {
  apiVersion: '1',
  usuario: USER,
  socios: [{ socioId: 'BANCO-001', productos: ['mortgage-life'] }],
  alcances: ['perfilamientos:crear'],
};

describe('Partner navigation through production routes', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let harness: RouterTestingHarness;
  let storage: TestAuthStorage;

  beforeEach(async () => {
    storage = new TestAuthStorage();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_GATEWAY, useClass: HttpAuthGateway },
        { provide: AUTH_STORAGE, useValue: storage },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    TestBed.inject(PartnerContextService).clear();
    http.verify();
  });

  async function login(): Promise<void> {
    auth = TestBed.inject(AuthService);
    const result = firstValueFrom(auth.login({ email: USER.correo, password: 'secret' }));
    const request = http.expectOne(`${API}/v1/sesiones`);
    expect(request.request.body).toEqual({ correo: USER.correo, contrasena: 'secret' });
    request.flush({
      usuario: USER,
      tokenType: 'Bearer',
      accessToken: 'partner-access',
      refreshToken: 'partner-refresh',
      expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      refreshExpiraEn: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await result;
  }

  it('integrates login, authorized organization data and partner-only navigation', async () => {
    await login();
    const navigation = harness.navigateByUrl('/app/socios');
    const request = await vi.waitFor(() => http.expectOne(`${API}/v1/socios/actual`));
    expect(request.request.headers.has('Authorization')).toBe(true);
    expect(request.request.headers.get('API-Version')).toBe('1');
    request.flush(CONTEXT);
    await navigation;
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/app/socios');
    expect(harness.routeNativeElement?.textContent).toContain('BANCO-001');
    expect(harness.routeNativeElement?.textContent).toContain('mortgage-life');
    expect(
      harness.routeNativeElement?.querySelector(
        'a[href="/app/socios/cotizaciones/solicitar?socio=BANCO-001"]',
      ),
    ).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/app/cotizaciones"]')).toBeNull();
    expect(JSON.stringify(storage.stored)).not.toContain('secret');
    expect(JSON.stringify(storage.stored)).not.toContain('partner-access');
  });

  it.each([403, 429, 503])(
    'never renders protected organization data on HTTP %s',
    async (status) => {
      await login();
      const navigation = harness.navigateByUrl('/app/socios');
      const request = await vi.waitFor(() => http.expectOne(`${API}/v1/socios/actual`));
      request.flush({}, { status, statusText: 'Rejected' });
      await navigation;
      expect(TestBed.inject(Router).url).toContain('/acceso-no-disponible');
      expect(harness.routeNativeElement?.textContent).not.toContain('BANCO-001');
      expect(harness.routeNativeElement?.querySelector('[role="alert"]')).not.toBeNull();
    },
  );

  it('requires a real token rather than authorizing from stored partner identity', async () => {
    storage.stored = {
      user: {
        id: USER.id,
        name: USER.nombre,
        email: USER.correo,
        role: 'partner',
        partnerIds: USER.socios,
      },
      refreshToken: 'stored-refresh',
      refreshExpiresAt: Date.now() + 60_000,
    };
    const navigation = harness.navigateByUrl('/app/socios');
    const renewal = await vi.waitFor(() => http.expectOne(`${API}/v1/sesiones/renovar`));
    renewal.flush({}, { status: 401, statusText: 'Expired' });
    await navigation;
    expect(TestBed.inject(Router).url).toContain('/acceso-no-disponible');
    expect(TestBed.inject(AuthService).session()).toBeNull();
    http.expectNone(`${API}/v1/socios/actual`);
  });

  it('does not send a partner to the client dashboard even with a crafted return URL', async () => {
    await login();
    const navigation = harness.navigateByUrl('/app/dashboard');
    const request = await vi.waitFor(() => http.expectOne(`${API}/v1/socios/actual`));
    request.flush(CONTEXT);
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/app/socios');
    http.expectNone(`${API}/v1/clientes/me/dashboard`);
  });

  it('denies a protected operation when the authenticated context lacks its scope', async () => {
    const router = TestBed.inject(Router);
    await login();
    const navigation = harness.navigateByUrl('/app/socios/cotizaciones/solicitar?socio=BANCO-001');
    const request = await vi.waitFor(() => http.expectOne(`${API}/v1/socios/actual`));
    request.flush({ ...CONTEXT, alcances: [] });
    await navigation;
    expect(router.url).toBe('/acceso-no-disponible?reason=forbidden');
    expect(TestBed.inject(PartnerContextService).context()).toBeNull();
  });
});

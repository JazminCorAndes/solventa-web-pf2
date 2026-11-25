import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { ADMINISTRATION_GATEWAY } from '../../core/administration/administration.gateway';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { TestAuthStorage, TEST_USER } from '../../core/auth/auth.testing';
import { HttpAdministrationGateway } from '../../data-access/administration/http-administration.gateway';
import { HttpAuthGateway } from '../../data-access/auth/http-auth.gateway';

const API = environment.apiBaseUrl;

describe('Navegación administrativa real', () => {
  let http: HttpTestingController;
  let storage: TestAuthStorage;
  let harness: RouterTestingHarness;

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
        { provide: ADMINISTRATION_GATEWAY, useClass: HttpAdministrationGateway },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());

  it('renueva la identidad antes de autorizar y conserva al administrador fuera del portal cliente', async () => {
    storage.stored = {
      user: TEST_USER,
      refreshToken: 'stored-refresh',
      refreshExpiresAt: Date.now() + 60_000,
    };
    const navigation = harness.navigateByUrl('/app/dashboard');
    const refresh = await vi.waitFor(() => http.expectOne(`${API}/v1/sesiones/renovar`));
    refresh.flush({
      usuario: {
        id: TEST_USER.id,
        nombre: TEST_USER.name,
        correo: TEST_USER.email,
        rol: 'administrador',
      },
      tokenType: 'Bearer',
      accessToken: 'admin-access',
      refreshToken: 'admin-refresh',
      expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      refreshExpiraEn: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await navigation;
    const queue = await vi.waitFor(() =>
      http.expectOne(`${API}/v1/administracion/colas-revision/revision/asignaciones`),
    );
    expect(queue.request.headers.get('Authorization')).toBe('Bearer admin-access');
    queue.flush({ tipo: 'cola', destino: 'revision', asignaciones: [] });
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/administracion/colas/revision');
    expect(TestBed.inject(AuthService).user()?.role).toBe('administrator');
    expect(harness.routeNativeElement?.textContent).toContain(es.administration.portal);
    expect(
      harness.routeNativeElement?.querySelector('a[href="/administracion/colas/fraude"]'),
    ).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('a[href="/app/dashboard"]')).toBeNull();
    http.expectNone(`${API}/v1/clientes/me/dashboard`);
    http.expectNone(`${API}/v1/socios/actual`);
  });

  it('exige login sin consultar bandejas cuando no existe sesión', async () => {
    await harness.navigateByUrl('/administracion/colas/revision');
    expect(TestBed.inject(Router).url).toContain('/iniciar-sesion?returnUrl=');
    http.expectNone(`${API}/v1/administracion/colas-revision/revision/asignaciones`);
  });

  it('no autoriza una identidad administrativa guardada cuando falla la renovación', async () => {
    storage.stored = {
      user: { ...TEST_USER, role: 'administrator' },
      refreshToken: 'expired-refresh',
      refreshExpiresAt: Date.now() + 60_000,
    };
    const navigation = harness.navigateByUrl('/administracion/colas/revision');
    (await vi.waitFor(() => http.expectOne(`${API}/v1/sesiones/renovar`))).flush(
      {},
      { status: 401, statusText: 'Expired' },
    );
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/acceso-no-disponible');
    expect(TestBed.inject(AuthService).session()).toBeNull();
    http.expectNone(`${API}/v1/administracion/colas-revision/revision/asignaciones`);
  });
});

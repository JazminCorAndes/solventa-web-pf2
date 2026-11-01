import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { ADVISOR_PROFILING_GATEWAY } from '../../core/advisor-profiling/advisor-profiling.gateway';
import {
  ADVISOR_PROFILING_STORAGE,
  BrowserAdvisorProfilingStorage,
} from '../../core/advisor-profiling/advisor-profiling-storage.service';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { TestAuthStorage } from '../../core/auth/auth.testing';
import { HttpAdvisorProfilingGateway } from '../../data-access/advisor-profiling/http-advisor-profiling.gateway';
import { HttpAuthGateway } from '../../data-access/auth/http-auth.gateway';
import { DASHBOARD_GATEWAY } from '../../core/dashboard/dashboard.gateway';
import { HttpDashboardGateway } from '../../data-access/dashboard/http-dashboard.gateway';
import { MortgageProfilingStartPageComponent } from './mortgage-profiling-start-page.component';

const API = environment.apiBaseUrl;
const ENDPOINT = `${API}/v1/perfilamientos-hipotecarios`;
const ADVISOR = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Asesor de prueba',
  correo: 'asesor@example.com',
  rol: 'asesor',
  socios: ['BANCO-001'],
};
const VALID = {
  customerId: '22222222-2222-4222-8222-222222222222',
  documentType: 'cc' as const,
  documentNumber: '1023456789',
  birthDate: '1985-02-10',
  phone: '+573001234567',
  creditReference: 'HIP-001',
  creditAmount: 310000000,
  termMonths: 240,
  consentId: '33333333-3333-4333-8333-333333333333',
  consentVersion: 1,
  consentVerified: true,
};

describe('HU46 con sesión asesor y HTTP controlado', () => {
  let fixture: ComponentFixture<MortgageProfilingStartPageComponent>;
  let page: MortgageProfilingStartPageComponent;
  let http: HttpTestingController;
  let auth: AuthService;

  function grant(socios: string[]) {
    return {
      usuario: { ...ADVISOR, socios },
      tokenType: 'Bearer',
      accessToken: 'synthetic-advisor-access',
      refreshToken: 'synthetic-advisor-refresh',
      expiraEn: new Date(Date.now() + 3600000).toISOString(),
      refreshExpiraEn: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  function receipt(operationId: string) {
    return {
      operationId,
      socioId: 'BANCO-001',
      clienteId: VALID.customerId,
      productoId: 'mortgage-life',
      estado: 'completada',
      perfilamientoReferencia: 'PRF-HIP-TEST',
      solicitudId: 'AQT-2026-TEST123',
      cotizacionId: '44444444-4444-4444-8444-444444444444',
      recibidaEn: '2026-10-24T12:00:00Z',
    };
  }

  beforeEach(async () => {
    sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage = new TestAuthStorage();
    storage.stored = {
      user: {
        id: ADVISOR.id,
        name: ADVISOR.nombre,
        email: ADVISOR.correo,
        role: 'advisor',
        partnerIds: ['SOCIO-OBSOLETO'],
      },
      refreshToken: 'synthetic-stored-refresh',
      refreshExpiresAt: Date.now() + 60000,
    };
    await TestBed.configureTestingModule({
      imports: [
        MortgageProfilingStartPageComponent,
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
        { provide: ADVISOR_PROFILING_GATEWAY, useClass: HttpAdvisorProfilingGateway },
        { provide: ADVISOR_PROFILING_STORAGE, useClass: BrowserAdvisorProfilingStorage },
        { provide: DASHBOARD_GATEWAY, useClass: HttpDashboardGateway },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    const restored = firstValueFrom(auth.synchronizeSession());
    http.expectOne(`${API}/v1/sesiones/renovar`).flush(grant(['BANCO-001']));
    await restored;
    fixture = TestBed.createComponent(MortgageProfilingStartPageComponent);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('envía el contrato real con token asesor y recupera el mismo recibo por replay del POST', () => {
    expect(page.partnerId()).toBe('BANCO-001');
    page.form.setValue(VALID);
    page.submit();
    const first = http.expectOne(ENDPOINT);
    const body = first.request.body;
    expect(first.request.headers.get('Authorization')).toBe('Bearer synthetic-advisor-access');
    expect(first.request.headers.get('API-Version')).toBe('1');
    expect(first.request.headers.get('Idempotency-Key')).toBe(body.operationId);
    first.flush({ code: 'servicio_no_disponible' }, { status: 503, statusText: 'Unavailable' });
    expect(page.result()).toBeNull();
    expect(page.form.enabled).toBe(true);
    page.submit();
    const retry = http.expectOne(ENDPOINT);
    expect(retry.request.method).toBe('POST');
    expect(retry.request.body).toEqual(body);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(body.operationId);
    retry.flush(receipt(body.operationId), { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(page.result()?.status).toBe('completed');
    expect(fixture.nativeElement.textContent).toContain('AQT-2026-TEST123');
    expect(fixture.nativeElement.textContent).toContain(es.mortgageProfiling.resultBody);
    page.submit();
    http.expectNone(ENDPOINT);
    http.expectNone((request) => request.url.includes('/ofertas'));
    http.expectNone((request) => request.method === 'GET');
  });

  it('rechaza un recibo de otro cliente, sin mostrar resultado y conservando la operación', () => {
    page.form.setValue(VALID);
    page.submit();
    const first = http.expectOne(ENDPOINT);
    const operationId = first.request.body.operationId;
    first.flush({
      ...receipt(operationId),
      clienteId: '55555555-5555-4555-8555-555555555555',
    });
    expect(page.result()).toBeNull();
    expect(page.errorCode()).toBe('invalid_response');
    page.submit();
    const retry = http.expectOne(ENDPOINT);
    expect(retry.request.body.operationId).toBe(operationId);
    retry.flush(receipt(operationId));
    expect(page.result()?.customerId).toBe(VALID.customerId);
  });

  it('bloquea sin efectos HTTP al perder sus socios en la renovación', async () => {
    const renewed = firstValueFrom(auth.renewAccessToken());
    http.expectOne(`${API}/v1/sesiones/renovar`).flush(grant([]));
    await renewed;
    fixture.detectChanges();
    page.form.setValue(VALID);
    page.submit();
    expect(auth.user()?.role).toBe('advisor');
    expect(page.result()).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      es.mortgageProfiling.errors.advisor_context_unavailable,
    );
    http.expectNone(() => true);
  });

  it('cancela la petición local y limpia datos al revocar el socio, sin reenviar con el nuevo', async () => {
    page.form.setValue(VALID);
    page.submit();
    const previous = http.expectOne(ENDPOINT);
    const renewed = firstValueFrom(auth.renewAccessToken());
    http.expectOne(`${API}/v1/sesiones/renovar`).flush(grant(['BANCO-002']));
    await renewed;
    fixture.detectChanges();
    expect(previous.cancelled).toBe(true);
    expect(page.processing()).toBe(false);
    expect(page.form.enabled).toBe(true);
    expect(page.form.controls.documentNumber.value).toBe('');
    expect(page.form.controls.consentVerified.value).toBe(false);
    expect(page.pendingOperation()).toBeNull();
    page.submit();
    http.expectNone(() => true);
    page.form.setValue(VALID);
    page.submit();
    const current = http.expectOne(ENDPOINT);
    expect(current.request.body.socioId).toBe('BANCO-002');
    expect(current.request.body.operationId).not.toBe(previous.request.body.operationId);
    current.flush({ ...receipt(current.request.body.operationId), socioId: 'BANCO-002' });
    expect(page.result()?.partnerId).toBe('BANCO-002');
  });

  it('mantiene al asesor en sus rutas sin activar HTTP de cliente ni contexto de socio', async () => {
    const harness = await RouterTestingHarness.create();
    for (const url of ['/asesor/perfilamientos/nuevo', '/app/dashboard', '/app/socios']) {
      await harness.navigateByUrl(url);
      expect(TestBed.inject(Router).url).toBe('/asesor/perfilamientos/nuevo');
    }
    http.expectNone(() => true);
  });

  it('redirige al cliente a su tablero sin activar el portal asesor', async () => {
    const renewed = firstValueFrom(auth.renewAccessToken());
    http.expectOne(`${API}/v1/sesiones/renovar`).flush({
      ...grant([]),
      usuario: { ...ADVISOR, rol: 'cliente', socios: undefined },
    });
    await renewed;
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/asesor/perfilamientos/nuevo');
    const dashboard = await vi.waitFor(() => http.expectOne(`${API}/v1/clientes/me/dashboard`));
    dashboard.flush({}, { status: 503, statusText: 'Unavailable' });
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/app/dashboard');
    http.expectNone(ENDPOINT);
    http.expectNone(`${API}/v1/socios/actual`);
  });
});

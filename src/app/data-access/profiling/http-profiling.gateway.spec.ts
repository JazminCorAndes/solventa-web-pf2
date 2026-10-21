import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { createConsentRequest } from '../../core/profiling/profiling.models';
import { HttpProfilingGateway } from './http-profiling.gateway';

describe('HttpProfilingGateway', () => {
  let gateway: HttpProfilingGateway;
  let http: HttpTestingController;
  const consentUrl = `${environment.apiBaseUrl}/v1/consentimientos/perfilamiento`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HttpProfilingGateway,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { getAccessToken: () => of('profile-test-token') } },
      ],
    });
    gateway = TestBed.inject(HttpProfilingGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta el consentimiento sin enviar cookies', async () => {
    const result = firstValueFrom(gateway.loadConsent());
    const request = http.expectOne(consentUrl);
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Authorization')).toBe('Bearer profile-test-token');
    expect(request.request.method).toBe('GET');
    const consent = createConsent();
    request.flush(consent, { headers: { Date: new Date().toUTCString() } });
    await expect(result).resolves.toEqual(consent);
  });

  it('reconoce solo la ausencia explicita de consentimiento', async () => {
    const result = firstValueFrom(gateway.loadConsent());
    http.expectOne(consentUrl).flush(
      { code: 'consentimiento_ausente' },
      {
        status: 404,
        statusText: 'Not Found',
        headers: { Date: new Date().toUTCString() },
      },
    );
    await expect(result).resolves.toBeNull();
    const failure = firstValueFrom(gateway.loadConsent());
    const assertion = expect(failure).rejects.toMatchObject({ status: 404 });
    http
      .expectOne(consentUrl)
      .flush({ code: 'ruta_no_encontrada' }, { status: 404, statusText: 'Not Found' });
    await assertion;
  });

  it.each([true, false])('guarda autorizado=%s sin enviar clienteId', async (authorized) => {
    const decision = {
      autorizado: authorized,
      version: 2,
      solicitud: createConsentRequest(Date.now()),
    };
    const result = firstValueFrom(gateway.saveConsent(decision));
    const request = http.expectOne(consentUrl);
    expect(request.request.method).toBe('PUT');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Authorization')).toBe('Bearer profile-test-token');
    expect(request.request.body).toEqual(decision);
    request.flush(createConsent(), { headers: { Date: new Date().toUTCString() } });
    await result;
  });

  it('conserva conflictos de version sin reintentar la escritura', async () => {
    const result = firstValueFrom(
      gateway.saveConsent({
        autorizado: true,
        version: 0,
        solicitud: createConsentRequest(Date.now()),
      }),
    );
    const assertion = expect(result).rejects.toMatchObject({
      status: 409,
      error: { code: 'conflicto_version' },
    });

    http
      .expectOne(consentUrl)
      .flush({ code: 'conflicto_version' }, { status: 409, statusText: 'Conflict' });
    await assertion;
    http.expectNone(consentUrl);
  });

  it('revoca sin solicitud ni identidad enviada por el cliente', async () => {
    const result = firstValueFrom(gateway.saveConsent({ autorizado: false, version: 3 }));
    const request = http.expectOne(consentUrl);
    expect(request.request.body).toEqual({ autorizado: false, version: 3 });
    request.flush(
      { ...createConsent(), estado: 'revocado', version: 4 },
      {
        headers: { Date: new Date().toUTCString() },
      },
    );
    await expect(result).resolves.toMatchObject({ estado: 'revocado', version: 4 });
  });

  it('consulta el perfil asociado sin convertir los decimales', async () => {
    const result = firstValueFrom(gateway.loadProfile('AQT-2026-123456'));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/AQT-2026-123456/perfilamiento`,
    );
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.get('Authorization')).toBe('Bearer profile-test-token');
    request.flush(createProfile(), { headers: { Date: new Date().toUTCString() } });
    await expect(result).resolves.toMatchObject({ score: '0.250000', fallbackUsed: false });
  });

  it('no acepta respuestas sin reloj del servidor', async () => {
    const result = firstValueFrom(gateway.loadConsent());
    const assertion = expect(result).rejects.toMatchObject({ code: 'reloj_no_disponible' });
    http.expectOne(consentUrl).flush(createConsent());
    await assertion;
  });
});

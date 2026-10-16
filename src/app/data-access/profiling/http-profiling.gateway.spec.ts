import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { HttpProfilingGateway } from './http-profiling.gateway';

describe('HttpProfilingGateway', () => {
  let gateway: HttpProfilingGateway;
  let http: HttpTestingController;
  const consentUrl = '/api/v1/consentimientos/perfilamiento';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpProfilingGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpProfilingGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta el consentimiento usando la cookie de sesion', async () => {
    const result = firstValueFrom(gateway.loadConsent());
    const request = http.expectOne(consentUrl);
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.method).toBe('GET');
    const consent = createConsent();
    request.flush(consent);
    await expect(result).resolves.toEqual(consent);
  });

  it('reconoce solo la ausencia explicita de consentimiento', async () => {
    const result = firstValueFrom(gateway.loadConsent());
    http
      .expectOne(consentUrl)
      .flush({ code: 'consentimiento_ausente' }, { status: 404, statusText: 'Not Found' });
    await expect(result).resolves.toBeNull();
    const failure = firstValueFrom(gateway.loadConsent());
    const assertion = expect(failure).rejects.toMatchObject({ status: 404 });
    http
      .expectOne(consentUrl)
      .flush({ code: 'ruta_no_encontrada' }, { status: 404, statusText: 'Not Found' });
    await assertion;
  });

  it.each([true, false])('guarda autorizado=%s sin enviar clienteId', async (authorized) => {
    const result = firstValueFrom(gateway.saveConsent(authorized, 2));
    const request = http.expectOne(consentUrl);
    expect(request.request.method).toBe('PUT');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ autorizado: authorized, version: 2 });
    request.flush(createConsent());
    await result;
  });

  it('conserva conflictos de version sin reintentar la escritura', async () => {
    const result = firstValueFrom(gateway.saveConsent(true, 0));
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

  it('consulta el perfil asociado sin convertir los decimales', async () => {
    const result = firstValueFrom(gateway.loadProfile('AQT-2026-123456'));
    const request = http.expectOne('/api/v1/solicitudes-cotizacion/AQT-2026-123456/perfilamiento');
    expect(request.request.withCredentials).toBe(true);
    request.flush(createProfile());
    await expect(result).resolves.toMatchObject({ score: '0.250000', fallbackUsed: false });
  });
});

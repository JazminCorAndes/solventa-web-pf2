import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { InvalidCredentialsError } from '../../core/auth/auth.errors';
import { HttpAuthGateway } from './http-auth.gateway';

const SESSION_RESPONSE = {
  usuario: {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Cliente Solventa',
    correo: 'cliente@solventa.co',
    rol: 'cliente' as const,
    tipoDocumento: 'cc' as const,
    identificacion: '1023456789',
    telefono: '+573001234567',
  },
  expiraEn: '2026-10-11T22:00:00Z',
};

describe('HttpAuthGateway', () => {
  let gateway: HttpAuthGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpAuthGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpAuthGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('logs in using the BFF session cookie', async () => {
    const result = firstValueFrom(
      gateway.login({
        email: 'cliente@solventa.co',
        password: 'Solventa123!',
      }),
    );
    const request = http.expectOne('/api/v1/sesiones');

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      correo: 'cliente@solventa.co',
      contrasena: 'Solventa123!',
    });
    request.flush(SESSION_RESPONSE);

    await expect(result).resolves.toEqual({
      user: {
        id: SESSION_RESPONSE.usuario.id,
        name: 'Cliente Solventa',
        email: 'cliente@solventa.co',
        role: 'client',
        documentType: 'cc',
        nationalId: '1023456789',
        phone: '+573001234567',
      },
      expiresAt: Date.parse(SESSION_RESPONSE.expiraEn),
    });
  });

  it('maps rejected credentials', async () => {
    const result = firstValueFrom(
      gateway.login({ email: 'cliente@solventa.co', password: 'incorrecta' }),
    );
    http.expectOne('/api/v1/sesiones').flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('treats an unauthorized current session as absent', async () => {
    const result = firstValueFrom(gateway.currentSession());
    http
      .expectOne('/api/v1/sesiones/actual')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toBeNull();
  });

  it('closes the remote session using its cookie', async () => {
    const result = firstValueFrom(gateway.logout());
    const request = http.expectOne('/api/v1/sesiones/actual');

    expect(request.request.method).toBe('DELETE');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeUndefined();
  });
});

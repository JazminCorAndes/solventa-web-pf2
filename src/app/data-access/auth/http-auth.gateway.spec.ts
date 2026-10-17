import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  AuthenticationUnavailableError,
  InvalidCredentialsError,
} from '../../core/auth/auth.errors';
import { AUTH_STORAGE, AuthStorage } from '../../core/auth/auth-storage.service';
import { AuthSession } from '../../core/auth/auth.models';
import { sessionBearerInterceptor } from '../../core/auth/session-bearer.interceptor';
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
  tokenType: 'Bearer',
  accessToken: 'access-token-prueba',
  refreshToken: 'refresh-token-prueba',
};

describe('HttpAuthGateway', () => {
  let gateway: HttpAuthGateway;
  let http: HttpTestingController;
  let stored: AuthSession | null;

  beforeEach(() => {
    stored = {
      user: { id: 'cliente', name: 'Cliente', email: 'cliente@solventa.co', role: 'client' },
      expiresAt: Date.now() + 60_000,
      accessToken: SESSION_RESPONSE.accessToken,
      refreshToken: SESSION_RESPONSE.refreshToken,
    };
    const storage: AuthStorage = {
      read: () => stored,
      write: (session) => {
        stored = session;
      },
      clear: () => {
        stored = null;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        HttpAuthGateway,
        provideHttpClient(withInterceptors([sessionBearerInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: storage },
      ],
    });
    gateway = TestBed.inject(HttpAuthGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('inicia sesión y obtiene los tokens Bearer del BFF', async () => {
    const result = firstValueFrom(
      gateway.login({
        email: 'cliente@solventa.co',
        password: 'Solventa123!',
      }),
    );
    const request = http.expectOne('/api/v1/sesiones');

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
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
      accessToken: SESSION_RESPONSE.accessToken,
      refreshToken: SESSION_RESPONSE.refreshToken,
    });
  });

  it('conserva los tokens al consultar la sesión actual', async () => {
    const result = firstValueFrom(gateway.currentSession());
    const request = http.expectOne('/api/v1/sesiones/actual');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token-prueba');
    request.flush({
      usuario: { id: 'cliente', nombre: 'Cliente', correo: 'cliente@solventa.co', rol: 'cliente' },
      expiraEn: SESSION_RESPONSE.expiraEn,
    });
    await expect(result).resolves.toMatchObject({
      accessToken: SESSION_RESPONSE.accessToken,
      refreshToken: SESSION_RESPONSE.refreshToken,
    });
  });

  it('rechaza una respuesta de inicio sin tokens en vez de simular autenticación', async () => {
    const result = firstValueFrom(
      gateway.login({ email: 'cliente@solventa.co', password: 'prueba' }),
    );
    http
      .expectOne('/api/v1/sesiones')
      .flush({ usuario: SESSION_RESPONSE.usuario, expiraEn: SESSION_RESPONSE.expiraEn });
    await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
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

  it('cierra la sesión con Bearer y revoca su token de renovación', async () => {
    const result = firstValueFrom(gateway.logout());
    const request = http.expectOne('/api/v1/sesiones/actual');

    expect(request.request.method).toBe('DELETE');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token-prueba');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-token-prueba' });
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(result).resolves.toBeUndefined();
  });
});

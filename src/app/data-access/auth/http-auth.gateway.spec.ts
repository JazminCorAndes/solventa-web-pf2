import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthenticationUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { HttpAuthGateway } from './http-auth.gateway';

const SESSIONS = `${environment.apiBaseUrl}/v1/sesiones`;
const USERS = `${environment.apiBaseUrl}/v1/usuarios`;

const USER_RESPONSE = {
  id: '11111111-1111-4111-8111-111111111111',
  nombre: 'Cliente Solventa',
  correo: 'cliente@solventa.co',
  rol: 'cliente' as const,
};

const TOKEN_RESPONSE = {
  usuario: USER_RESPONSE,
  tokenType: 'Bearer' as const,
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiraEn: '2026-10-11T22:00:00Z',
  refreshExpiraEn: '2026-10-18T21:00:00Z',
};

const EXPECTED_USER = {
  id: USER_RESPONSE.id,
  name: 'Cliente Solventa',
  email: 'cliente@solventa.co',
  role: 'client',
  documentType: undefined,
  nationalId: undefined,
  phone: undefined,
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

  describe('login', () => {
    it('rejects unknown roles instead of treating them as clients', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      http.expectOne(SESSIONS).flush({
        ...TOKEN_RESPONSE,
        usuario: { ...USER_RESPONSE, rol: 'desconocido' },
      });
      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });
    it.each([
      { tokenType: 'Basic' },
      { accessToken: undefined },
      { refreshToken: undefined },
      { expiraEn: 'invalid' },
      { refreshExpiraEn: 'invalid' },
    ])('rejects an invalid token response: %j', async (fields) => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      http.expectOne(SESSIONS).flush({ ...TOKEN_RESPONSE, ...fields });

      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });

    it('preserves identity details supplied by the backend', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      http.expectOne(SESSIONS).flush({
        ...TOKEN_RESPONSE,
        usuario: {
          ...USER_RESPONSE,
          tipoDocumento: 'ce',
          identificacion: '1023456789',
          telefono: '+573001234567',
        },
      });

      await expect(result).resolves.toMatchObject({
        session: {
          user: { documentType: 'ce', nationalId: '1023456789', phone: '+573001234567' },
        },
      });
    });

    it('exchanges credentials for tokens and does not use cookies', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      const request = http.expectOne(SESSIONS);

      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBe(false);
      expect(request.request.body).toEqual({
        correo: 'cliente@solventa.co',
        contrasena: 'Solventa123!',
      });
      request.flush(TOKEN_RESPONSE);

      await expect(result).resolves.toEqual({
        session: { user: EXPECTED_USER, expiresAt: Date.parse(TOKEN_RESPONSE.expiraEn) },
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          refreshExpiresAt: Date.parse(TOKEN_RESPONSE.refreshExpiraEn),
        },
      });
    });

    it.each([
      [401, InvalidCredentialsError],
      [503, AuthenticationUnavailableError],
      [0, AuthenticationUnavailableError],
    ])('maps HTTP %s', async (status, expected) => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'incorrecta' }),
      );
      http.expectOne(SESSIONS).flush({}, { status, statusText: 'Error' });

      await expect(result).rejects.toBeInstanceOf(expected);
    });

    it('maps rate limiting and exposes Retry-After', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'incorrecta' }),
      );
      http
        .expectOne(SESSIONS)
        .flush({}, { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '300' } });

      await expect(result).rejects.toMatchObject({
        name: 'TooManyAttemptsError',
        retryAfterSeconds: 300,
      });
    });

    it('reports an unknown Retry-After as null', async () => {
      const result = firstValueFrom(gateway.login({ email: 'a@solventa.co', password: 'x' }));
      http.expectOne(SESSIONS).flush({}, { status: 429, statusText: 'Too Many' });

      const error = await result.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TooManyAttemptsError);
      expect((error as TooManyAttemptsError).retryAfterSeconds).toBeNull();
    });
  });

  describe('refresh', () => {
    it('renews the tokens using the refresh token', async () => {
      const result = firstValueFrom(gateway.refresh('old-refresh'));
      const request = http.expectOne(`${SESSIONS}/renovar`);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ refreshToken: 'old-refresh' });
      request.flush(TOKEN_RESPONSE);

      await expect(result).resolves.toMatchObject({
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' },
      });
    });

    it('maps a rejected refresh token', async () => {
      const result = firstValueFrom(gateway.refresh('bad'));
      http
        .expectOne(`${SESSIONS}/renovar`)
        .flush({ code: 'refresh_invalido' }, { status: 401, statusText: 'Unauthorized' });

      await expect(result).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('maps an unavailable backend', async () => {
      const result = firstValueFrom(gateway.refresh('x'));
      http.expectOne(`${SESSIONS}/renovar`).flush({}, { status: 503, statusText: 'Unavailable' });

      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });
  });

  describe('currentSession', () => {
    it('maps the current session', async () => {
      const result = firstValueFrom(gateway.currentSession());
      const request = http.expectOne(`${SESSIONS}/actual`);

      expect(request.request.withCredentials).toBe(false);
      request.flush({ usuario: USER_RESPONSE, expiraEn: TOKEN_RESPONSE.expiraEn });

      await expect(result).resolves.toEqual({
        user: EXPECTED_USER,
        expiresAt: Date.parse(TOKEN_RESPONSE.expiraEn),
      });
    });

    it('treats an unauthorized current session as absent', async () => {
      const result = firstValueFrom(gateway.currentSession());
      http.expectOne(`${SESSIONS}/actual`).flush({}, { status: 401, statusText: 'Unauthorized' });

      await expect(result).resolves.toBeNull();
    });

    it('reports an unavailable backend', async () => {
      const result = firstValueFrom(gateway.currentSession());
      http.expectOne(`${SESSIONS}/actual`).flush({}, { status: 503, statusText: 'Unavailable' });

      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });
  });

  describe('logout', () => {
    it('closes the remote session sending the refresh token', async () => {
      const result = firstValueFrom(gateway.logout('refresh-token'));
      const request = http.expectOne(`${SESSIONS}/actual`);

      expect(request.request.method).toBe('DELETE');
      expect(request.request.withCredentials).toBe(false);
      expect(request.request.body).toEqual({ refreshToken: 'refresh-token' });
      request.flush(null, { status: 204, statusText: 'No Content' });

      await expect(result).resolves.toBeUndefined();
    });

    it('omits the body without a refresh token', async () => {
      const result = firstValueFrom(gateway.logout(null));
      const request = http.expectOne(`${SESSIONS}/actual`);

      expect(request.request.body).toBeNull();
      request.flush(null, { status: 204, statusText: 'No Content' });

      await expect(result).resolves.toBeUndefined();
    });

    it('ignores an already invalid session', async () => {
      const result = firstValueFrom(gateway.logout('x'));
      http.expectOne(`${SESSIONS}/actual`).flush({}, { status: 401, statusText: 'Unauthorized' });

      await expect(result).resolves.toBeUndefined();
    });

    it('reports an unavailable backend', async () => {
      const result = firstValueFrom(gateway.logout('x'));
      http.expectOne(`${SESSIONS}/actual`).flush({}, { status: 503, statusText: 'Unavailable' });

      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });
  });

  describe('register', () => {
    const DATA = { name: 'Ana Cliente', email: 'ana@solventa.co', password: 'Solventa123!' };

    it('creates a user', async () => {
      const result = firstValueFrom(gateway.register(DATA));
      const request = http.expectOne(USERS);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        nombre: 'Ana Cliente',
        correo: 'ana@solventa.co',
        contrasena: 'Solventa123!',
      });
      request.flush({ usuario: USER_RESPONSE }, { status: 201, statusText: 'Created' });

      await expect(result).resolves.toEqual(EXPECTED_USER);
    });

    it.each([
      [409, EmailAlreadyRegisteredError],
      [429, TooManyAttemptsError],
      [503, AuthenticationUnavailableError],
    ])('maps HTTP %s', async (status, expected) => {
      const result = firstValueFrom(gateway.register(DATA));
      http.expectOne(USERS).flush({}, { status, statusText: 'Error' });

      await expect(result).rejects.toBeInstanceOf(expected);
    });
  });
});

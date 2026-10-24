import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { compactDecrypt, exportJWK, generateKeyPair, type JWK } from 'jose';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccessDeniedError,
  AuthenticationUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  LoginEncryptionUnavailableError,
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
    it('accepts the real partner role and preserves authorized organizations', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'socio@example.com', password: 'secret' }),
      );
      const request = await flushChallenge();
      request.flush({
        ...TOKEN_RESPONSE,
        usuario: { ...USER_RESPONSE, rol: 'socio', socios: ['BANCO-001'] },
      });
      await expect(result).resolves.toMatchObject({
        session: { user: { role: 'partner', partnerIds: ['BANCO-001'] } },
      });
    });

    it.each([undefined, [], [''], [12], ['BANCO-001', 'BANCO-001']])(
      'rejects a partner without valid organization membership: %j',
      async (socios) => {
        const result = firstValueFrom(
          gateway.login({ email: 'socio@example.com', password: 'secret' }),
        );
        const request = await flushChallenge();
        request.flush({
          ...TOKEN_RESPONSE,
          usuario: { ...USER_RESPONSE, rol: 'socio', socios },
        });
        await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
      },
    );

    it('does not treat an advisor as a partner', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'asesor@example.com', password: 'secret' }),
      );
      const request = await flushChallenge();
      request.flush({
        ...TOKEN_RESPONSE,
        usuario: { ...USER_RESPONSE, rol: 'asesor', socios: ['BANCO-001'] },
      });
      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });
    let privateKey: CryptoKey;
    let publicJwk: JWK;
    const credentials = { email: 'cliente@solventa.co', password: 'Solventa123!' };
    const challenge = () => ({
      desafioId: 'test-challenge',
      clavePublica: {
        kty: publicJwk.kty,
        n: publicJwk.n,
        e: publicJwk.e,
        alg: 'RSA-OAEP-256',
        use: 'enc',
        kid: 'test-key',
      },
      expiraEn: new Date(Date.now() + 60000).toISOString(),
    });
    const flushChallenge = async () => {
      const request = http.expectOne(`${SESSIONS}/desafio`);
      expect(request.request.method).toBe('GET');
      expect(request.request.body).toBeNull();
      request.flush(challenge());
      return vi.waitFor(() => http.expectOne(SESSIONS), { timeout: 2000 });
    };

    beforeAll(async () => {
      const pair = await generateKeyPair('RSA-OAEP-256', { extractable: true });
      privateKey = pair.privateKey;
      publicJwk = await exportJWK(pair.publicKey);
    });

    beforeEach(() => {
      vi.stubGlobal('isSecureContext', true);
      // jsdom and Node's TextEncoder otherwise expose different Uint8Array realms.
      vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
    });
    afterEach(() => vi.unstubAllGlobals());

    it('rejects unknown roles instead of treating them as clients', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      const request = await flushChallenge();
      request.flush({
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
      const request = await flushChallenge();
      request.flush({ ...TOKEN_RESPONSE, ...fields });

      await expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
    });

    it('preserves identity details supplied by the backend', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      const request = await flushChallenge();
      request.flush({
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

    it('sends only compact JWE and email, decryptable only with the issued key, without cookies', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }),
      );
      const request = await flushChallenge();

      expect(request.request.method).toBe('POST');
      expect(request.request.withCredentials).toBe(false);
      const body = request.request.body as { correo: string; credencialCifrada: string };
      expect(Object.keys(body).sort()).toEqual(['correo', 'credencialCifrada']);
      expect(body.correo).toBe(credentials.email);
      expect(JSON.stringify(body)).not.toContain(credentials.password);
      expect(body.credencialCifrada.split('.')).toHaveLength(5);
      const { plaintext, protectedHeader } = await compactDecrypt(
        body.credencialCifrada,
        privateKey,
      );
      expect(protectedHeader).toEqual({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        kid: 'test-key',
        typ: 'solventa-login+jwe',
      });
      expect(JSON.parse(new TextDecoder().decode(plaintext))).toEqual({
        desafioId: 'test-challenge',
        correo: credentials.email,
        contrasena: credentials.password,
      });
      const otherPair = await generateKeyPair('RSA-OAEP-256');
      await expect(compactDecrypt(body.credencialCifrada, otherPair.privateKey)).rejects.toThrow();
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
      [403, AccessDeniedError],
      [503, AuthenticationUnavailableError],
      [0, AuthenticationUnavailableError],
    ])('maps HTTP %s', async (status, expected) => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'incorrecta' }),
      );
      const request = await flushChallenge();
      request.flush({}, { status, statusText: 'Error' });

      await expect(result).rejects.toBeInstanceOf(expected);
    });

    it('maps rate limiting and exposes Retry-After', async () => {
      const result = firstValueFrom(
        gateway.login({ email: 'cliente@solventa.co', password: 'incorrecta' }),
      );
      const request = await flushChallenge();
      request.flush({}, { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '300' } });

      await expect(result).rejects.toMatchObject({
        name: 'TooManyAttemptsError',
        retryAfterSeconds: 300,
      });
    });

    it('reports an unknown Retry-After as null', async () => {
      const result = firstValueFrom(gateway.login({ email: 'a@solventa.co', password: 'x' }));
      const request = await flushChallenge();
      request.flush({}, { status: 429, statusText: 'Too Many' });

      const error = await result.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TooManyAttemptsError);
      expect((error as TooManyAttemptsError).retryAfterSeconds).toBeNull();
    });

    it.each([
      null,
      { desafioId: undefined },
      { desafioId: '' },
      { expiraEn: 'not-a-date' },
      { expiraEn: new Date(0).toISOString() },
      { expiraEn: '2100-01-01T00:00:00+01:00' },
      { clavePublica: { kty: 'oct', k: 'secret' } },
    ])('rejects a malformed or expired challenge without posting: %j', async (fields) => {
      const result = firstValueFrom(gateway.login(credentials));
      const rejected = expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
      http
        .expectOne(`${SESSIONS}/desafio`)
        .flush(fields === null ? null : { ...challenge(), ...fields });
      await rejected;
      http.expectNone(SESSIONS);
    });

    it.each([
      { kty: 'EC' },
      { alg: 'RSA-OAEP' },
      { use: 'sig' },
      { kid: '' },
      { kid: ' ' },
      { n: 'invalid!' },
      { n: 'AQAB' },
      { e: undefined },
      { e: '' },
      { d: 'private-material' },
      { p: 'private-material' },
      { q: 'private-material' },
      { dp: 'private-material' },
      { dq: 'private-material' },
      { qi: 'private-material' },
      { oth: [] },
    ])('rejects an unusable/private/wrong-algorithm key without posting: %j', async (fields) => {
      const issued = challenge();
      const result = firstValueFrom(gateway.login(credentials));
      const rejected = expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
      http.expectOne(`${SESSIONS}/desafio`).flush({
        ...issued,
        clavePublica: { ...issued.clavePublica, ...fields },
      });
      await rejected;
      http.expectNone(SESSIONS);
    });

    it.each([
      [503, AuthenticationUnavailableError],
      [404, HttpErrorResponse],
      [429, TooManyAttemptsError],
    ])('does not downgrade when the challenge endpoint returns %s', async (status, expected) => {
      const result = firstValueFrom(gateway.login(credentials));
      const rejected = expect(result).rejects.toBeInstanceOf(expected);
      http.expectOne(`${SESSIONS}/desafio`).flush({}, { status, statusText: 'Error' });
      await rejected;
      http.expectNone(SESSIONS);
    });

    it.each(['insecure', 'missing-subtle'] as const)(
      'fails explicitly without making HTTP calls: %s',
      async (failure) => {
        if (failure === 'insecure') vi.stubGlobal('isSecureContext', false);
        else vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
        await expect(firstValueFrom(gateway.login(credentials))).rejects.toBeInstanceOf(
          LoginEncryptionUnavailableError,
        );
        http.expectNone(`${SESSIONS}/desafio`);
        http.expectNone(SESSIONS);
      },
    );

    it('does not post or expose crypto errors when encryption fails', async () => {
      const encrypt = vi
        .spyOn(crypto.subtle, 'encrypt')
        .mockRejectedValue(new Error('synthetic crypto failure'));
      try {
        const result = firstValueFrom(gateway.login(credentials));
        const rejected = expect(result).rejects.toBeInstanceOf(AuthenticationUnavailableError);
        http.expectOne(`${SESSIONS}/desafio`).flush(challenge());
        await rejected;
        http.expectNone(SESSIONS);
        expect(encrypt).toHaveBeenCalled();
      } finally {
        encrypt.mockRestore();
      }
    });

    it('requests a new challenge per retry, without retaining the first ciphertext', async () => {
      let firstCiphertext: string | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = firstValueFrom(gateway.login(credentials));
        const rejected = expect(result).rejects.toBeInstanceOf(InvalidCredentialsError);
        http.expectOne(`${SESSIONS}/desafio`).flush({
          ...challenge(),
          desafioId: `challenge-${attempt}`,
        });
        let request: ReturnType<HttpTestingController['expectOne']> | undefined;
        await vi.waitFor(
          () => {
            request = http.expectOne(SESSIONS);
          },
          { timeout: 2000 },
        );
        const ciphertext = request!.request.body.credencialCifrada as string;
        expect(ciphertext).not.toBe(firstCiphertext);
        const { plaintext } = await compactDecrypt(ciphertext, privateKey);
        expect(JSON.parse(new TextDecoder().decode(plaintext)).desafioId).toBe(
          `challenge-${attempt}`,
        );
        firstCiphertext = ciphertext;
        request!.flush({}, { status: 401, statusText: 'Unauthorized' });
        await rejected;
      }
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

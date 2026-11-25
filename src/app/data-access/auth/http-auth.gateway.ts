import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CompactEncrypt, importJWK } from 'jose';
import { catchError, defer, map, Observable, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccessDeniedError,
  AuthenticationUnavailableError,
  CredentialEncryptionUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidRegistrationError,
  InvalidRecoveryLinkError,
  InvalidRecoveryRequestError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AuthGateway } from '../../core/auth/auth.gateway';
import {
  AuthGrant,
  AuthSession,
  AuthUser,
  DocumentType,
  LoginCredentials,
  RegistrationData,
  isPartnerIds,
} from '../../core/auth/auth.models';

interface UserResponse {
  id: string;
  nombre: string;
  correo: string;
  rol: 'cliente' | 'socio' | 'asesor' | 'administrador';
  socios?: string[];
  permisos?: string[];
  tipoDocumento?: DocumentType;
  identificacion?: string;
  telefono?: string;
}

interface SessionResponse {
  usuario: UserResponse;
  expiraEn: string;
  tokenType?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface TokenResponse extends SessionResponse {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  refreshExpiraEn: string;
}

const RECOVERY_ACCEPTANCE_MESSAGES = [
  'Si existe una cuenta con ese correo, recibiras un enlace de recuperacion.',
  'Si existe una cuenta con ese correo, el administrador recibira un enlace de recuperacion.',
];

@Injectable()
export class HttpAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly sessionsUrl = `${environment.apiBaseUrl}/v1/sesiones`;
  private readonly usersUrl = `${environment.apiBaseUrl}/v1/usuarios`;
  private readonly recoveryUrl = `${environment.apiBaseUrl}/v1/recuperacion-contrasena`;

  requestPasswordRecovery(email: string): Observable<void> {
    return this.http
      .post<unknown>(this.recoveryUrl, { correo: email }, { observe: 'response' })
      .pipe(
        map((response) => {
          const body = response.body;
          if (
            response.status !== 202 ||
            !body ||
            typeof body !== 'object' ||
            Array.isArray(body) ||
            Object.keys(body).length !== 1 ||
            !('mensaje' in body) ||
            typeof body.mensaje !== 'string' ||
            !RECOVERY_ACCEPTANCE_MESSAGES.includes(body.mensaje)
          ) {
            throw new AuthenticationUnavailableError();
          }
        }),
        catchError((error: unknown) => this.mapRecoveryError(error)),
      );
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.requestEncryptedCredentials(
      this.recoveryUrl,
      { token, contrasena: password },
      'solventa-reset+jwe',
    ).pipe(
      switchMap((credencialCifrada) =>
        this.http.post<unknown>(
          `${this.recoveryUrl}/confirmar`,
          { token, credencialCifrada },
          { observe: 'response' },
        ),
      ),
      map((response) => {
        if (response.status !== 204) throw new AuthenticationUnavailableError();
      }),
      catchError((error: unknown) => this.mapRecoveryError(error)),
    );
  }

  private mapRecoveryError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      if (error.error?.code === 'recuperacion_invalida') {
        return throwError(() => new InvalidRecoveryLinkError());
      }
      if (error.error?.code === 'solicitud_invalida') {
        return throwError(() => new InvalidRecoveryRequestError());
      }
    }
    return this.mapCommonError(error);
  }

  register(data: RegistrationData): Observable<AuthUser> {
    return this.requestEncryptedCredentials(this.usersUrl, data, 'solventa-register+jwe').pipe(
      switchMap((credencialCifrada) =>
        this.http.post<{ usuario: UserResponse }>(this.usersUrl, {
          nombre: data.name,
          correo: data.email,
          credencialCifrada,
          tipoDocumento: data.documentType,
          numeroDocumento: data.documentNumber,
          telefono: data.phone,
          fechaNacimiento: data.birthDate,
          consentimiento: {
            autorizado: data.consent.authorized,
            versionTerminos: data.consent.termsVersion,
          },
        }),
      ),
      map((response) => toUser(response.usuario)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return throwError(() => new AuthenticationUnavailableError());
        }
        if (error instanceof HttpErrorResponse && error.status === 400) {
          return throwError(() => new InvalidRegistrationError());
        }
        if (error instanceof HttpErrorResponse && error.status === 409) {
          return throwError(() => new EmailAlreadyRegisteredError());
        }
        return this.mapCommonError(error);
      }),
    );
  }

  login(credentials: LoginCredentials): Observable<AuthGrant> {
    return this.requestEncryptedCredentials(
      this.sessionsUrl,
      credentials,
      'solventa-login+jwe',
    ).pipe(
      switchMap((credencialCifrada) =>
        this.http.post<TokenResponse>(this.sessionsUrl, {
          correo: credentials.email,
          credencialCifrada,
        }),
      ),
      map(toGrant),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return throwError(() => new InvalidCredentialsError());
        }
        return this.mapCommonError(error);
      }),
    );
  }

  refresh(refreshToken: string): Observable<AuthGrant> {
    return this.http.post<TokenResponse>(`${this.sessionsUrl}/renovar`, { refreshToken }).pipe(
      map(toGrant),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return throwError(() => new InvalidRefreshTokenError());
        }
        return this.mapCommonError(error);
      }),
    );
  }

  currentSession(): Observable<AuthSession | null> {
    return this.http.get<SessionResponse>(`${this.sessionsUrl}/actual`).pipe(
      map(toSession),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return of(null);
        }
        return throwError(() => new AuthenticationUnavailableError());
      }),
    );
  }

  logout(refreshToken: string | null): Observable<void> {
    return this.http
      .request<void>('DELETE', `${this.sessionsUrl}/actual`, {
        body: refreshToken ? { refreshToken } : undefined,
      })
      .pipe(
        map(() => undefined),
        catchError((error: unknown) => {
          if (
            (error instanceof HttpErrorResponse && error.status === 401) ||
            error instanceof InvalidRefreshTokenError
          ) {
            return of(undefined);
          }
          return throwError(() => new AuthenticationUnavailableError());
        }),
      );
  }

  private requestEncryptedCredentials(
    baseUrl: string,
    credentials: LoginCredentials | { token: string; contrasena: string },
    type: CredentialType,
  ): Observable<string> {
    return defer(() => {
      if (globalThis.isSecureContext !== true || !globalThis.crypto?.subtle) {
        throw new CredentialEncryptionUnavailableError();
      }
      return this.http.get<unknown>(`${baseUrl}/desafio`);
    }).pipe(switchMap((challenge) => encryptCredentials(challenge, credentials, type)));
  }

  private mapCommonError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) {
        return throwError(() => new AccessDeniedError());
      }
      if (error.status === 429) {
        return throwError(() => new TooManyAttemptsError(parseRetryAfter(error)));
      }
      if (error.status === 0 || error.status === 503) {
        return throwError(() => new AuthenticationUnavailableError());
      }
    }
    return throwError(() => error);
  }
}

type CredentialType = 'solventa-login+jwe' | 'solventa-register+jwe' | 'solventa-reset+jwe';

async function encryptCredentials(
  response: unknown,
  credentials: LoginCredentials | { token: string; contrasena: string },
  type: CredentialType,
): Promise<string> {
  try {
    if (!response || typeof response !== 'object') {
      throw new AuthenticationUnavailableError();
    }
    const { desafioId, clavePublica, expiraEn } = response as Record<string, unknown>;
    const key = clavePublica as Record<string, unknown> | null;
    const expiresAt = typeof expiraEn === 'string' ? Date.parse(expiraEn) : NaN;
    if (
      typeof desafioId !== 'string' ||
      !desafioId.trim() ||
      typeof expiraEn !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(expiraEn) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      !key ||
      typeof key !== 'object' ||
      Object.keys(key).some((field) => !['kty', 'n', 'e', 'alg', 'use', 'kid'].includes(field)) ||
      key['kty'] !== 'RSA' ||
      key['alg'] !== 'RSA-OAEP-256' ||
      key['use'] !== 'enc' ||
      typeof key['kid'] !== 'string' ||
      !key['kid'].trim() ||
      typeof key['n'] !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(key['n']) ||
      typeof key['e'] !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(key['e'])
    ) {
      throw new AuthenticationUnavailableError();
    }
    const publicKey = await importJWK(key, 'RSA-OAEP-256');
    const encrypted = await new CompactEncrypt(
      new TextEncoder().encode(
        JSON.stringify({
          desafioId,
          ...('token' in credentials
            ? credentials
            : { correo: credentials.email, contrasena: credentials.password }),
        }),
      ),
    )
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        kid: key['kid'],
        typ: type,
      })
      .encrypt(publicKey);
    if (expiresAt <= Date.now()) {
      throw new AuthenticationUnavailableError();
    }
    return encrypted;
  } catch {
    // Crypto and contract errors must not leak credentials or trigger a plaintext retry.
    throw new AuthenticationUnavailableError();
  }
}

function parseRetryAfter(error: HttpErrorResponse): number | null {
  const seconds = Number(error.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function toUser(user: UserResponse): AuthUser {
  if (
    !user ||
    !['cliente', 'socio', 'asesor', 'administrador'].includes(user.rol) ||
    typeof user.id !== 'string' ||
    typeof user.nombre !== 'string' ||
    typeof user.correo !== 'string'
  ) {
    throw new AuthenticationUnavailableError();
  }
  if (user.rol === 'socio' && (!isPartnerIds(user.socios) || user.socios.length === 0)) {
    throw new AuthenticationUnavailableError();
  }
  if (
    (user.rol === 'administrador' || user.rol === 'asesor') &&
    user.socios !== undefined &&
    (!isPartnerIds(user.socios) || user.socios.length !== 0)
  ) {
    throw new AuthenticationUnavailableError();
  }
  if (user.permisos !== undefined && !isPartnerIds(user.permisos)) {
    throw new AuthenticationUnavailableError();
  }
  return {
    id: user.id,
    name: user.nombre,
    email: user.correo,
    role:
      user.rol === 'administrador'
        ? 'administrator'
        : user.rol === 'socio'
          ? 'partner'
          : user.rol === 'asesor'
            ? 'advisor'
            : 'client',
    ...(user.rol === 'socio' ? { partnerIds: [...user.socios!] } : {}),
    ...(user.permisos !== undefined ? { permissions: [...user.permisos] } : {}),
    documentType: user.tipoDocumento,
    nationalId: user.identificacion,
    phone: user.telefono,
  };
}

function toSession(response: SessionResponse): AuthSession {
  const expiresAt = Date.parse(response.expiraEn);
  if (!Number.isFinite(expiresAt)) {
    throw new AuthenticationUnavailableError();
  }
  return { user: toUser(response.usuario), expiresAt };
}

function toGrant(response: TokenResponse): AuthGrant {
  const refreshExpiresAt = Date.parse(response.refreshExpiraEn);
  if (
    response.tokenType !== 'Bearer' ||
    !response.accessToken ||
    !response.refreshToken ||
    !Number.isFinite(refreshExpiresAt)
  ) {
    throw new AuthenticationUnavailableError();
  }
  return {
    session: toSession(response),
    tokens: {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      refreshExpiresAt,
    },
  };
}

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CompactEncrypt, importJWK } from 'jose';
import { catchError, defer, map, Observable, of, switchMap, throwError } from 'rxjs';
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
import { AuthGateway } from '../../core/auth/auth.gateway';
import {
  AuthGrant,
  AuthSession,
  AuthUser,
  DocumentType,
  LoginCredentials,
  RegistrationData,
} from '../../core/auth/auth.models';

interface UserResponse {
  id: string;
  nombre: string;
  correo: string;
  rol: 'cliente' | 'socio';
  socios?: string[];
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

@Injectable()
export class HttpAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly sessionsUrl = `${environment.apiBaseUrl}/v1/sesiones`;
  private readonly usersUrl = `${environment.apiBaseUrl}/v1/usuarios`;

  register(data: RegistrationData): Observable<AuthUser> {
    return this.http
      .post<{ usuario: UserResponse }>(this.usersUrl, {
        nombre: data.name,
        correo: data.email,
        contrasena: data.password,
      })
      .pipe(
        map((response) => toUser(response.usuario)),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            return throwError(() => new EmailAlreadyRegisteredError());
          }
          return this.mapCommonError(error);
        }),
      );
  }

  login(credentials: LoginCredentials): Observable<AuthGrant> {
    return defer(() => {
      if (globalThis.isSecureContext !== true || !globalThis.crypto?.subtle) {
        throw new LoginEncryptionUnavailableError();
      }
      return this.http.get<unknown>(`${this.sessionsUrl}/desafio`);
    }).pipe(
      switchMap((challenge) => encryptCredentials(challenge, credentials)),
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

async function encryptCredentials(
  response: unknown,
  credentials: LoginCredentials,
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
          correo: credentials.email,
          contrasena: credentials.password,
        }),
      ),
    )
      .setProtectedHeader({
        alg: 'RSA-OAEP-256',
        enc: 'A256GCM',
        kid: key['kid'],
        typ: 'solventa-login+jwe',
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
    (user.rol !== 'cliente' && user.rol !== 'socio') ||
    typeof user.id !== 'string' ||
    typeof user.nombre !== 'string' ||
    typeof user.correo !== 'string'
  ) {
    throw new AuthenticationUnavailableError();
  }
  if (
    user.rol === 'socio' &&
    (!Array.isArray(user.socios) ||
      user.socios.length === 0 ||
      !user.socios.every((id) => typeof id === 'string' && id.trim().length > 0) ||
      new Set(user.socios).size !== user.socios.length)
  ) {
    throw new AuthenticationUnavailableError();
  }
  return {
    id: user.id,
    name: user.nombre,
    email: user.correo,
    role: user.rol === 'socio' ? 'partner' : 'client',
    ...(user.rol === 'socio' ? { partnerIds: [...user.socios!] } : {}),
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

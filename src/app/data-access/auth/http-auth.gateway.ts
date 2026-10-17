import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthenticationUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
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
  rol: 'cliente';
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
    return this.http
      .post<TokenResponse>(this.sessionsUrl, {
        correo: credentials.email,
        contrasena: credentials.password,
      })
      .pipe(
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

function parseRetryAfter(error: HttpErrorResponse): number | null {
  const seconds = Number(error.headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function toUser(user: UserResponse): AuthUser {
  return {
    id: user.id,
    name: user.nombre,
    email: user.correo,
    role: 'client',
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

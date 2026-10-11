import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthenticationUnavailableError,
  InvalidCredentialsError,
} from '../../core/auth/auth.errors';
import { AuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession, LoginCredentials } from '../../core/auth/auth.models';

interface SessionResponse {
  usuario: {
    id: string;
    nombre: string;
    correo: string;
    rol: 'cliente';
  };
  expiraEn: string;
}

@Injectable()
export class HttpAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly sessionsUrl = `${environment.apiBaseUrl}/v1/sesiones`;

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.http
      .post<SessionResponse>(
        this.sessionsUrl,
        {
          correo: credentials.email,
          contrasena: credentials.password,
        },
        { withCredentials: true },
      )
      .pipe(
        map(toSession),
        catchError((error: unknown) => this.mapLoginError(error)),
      );
  }

  currentSession(): Observable<AuthSession | null> {
    return this.http
      .get<SessionResponse>(`${this.sessionsUrl}/actual`, { withCredentials: true })
      .pipe(
        map(toSession),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            return of(null);
          }
          return throwError(() => new AuthenticationUnavailableError());
        }),
      );
  }

  logout(): Observable<void> {
    return this.http.delete<void>(`${this.sessionsUrl}/actual`, { withCredentials: true }).pipe(
      map(() => undefined),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          return of(undefined);
        }
        return throwError(() => new AuthenticationUnavailableError());
      }),
    );
  }

  private mapLoginError(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      return throwError(() => new InvalidCredentialsError());
    }
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status === 503)) {
      return throwError(() => new AuthenticationUnavailableError());
    }
    return throwError(() => error);
  }
}

function toSession(response: SessionResponse): AuthSession {
  return {
    user: {
      id: response.usuario.id,
      name: response.usuario.nombre,
      email: response.usuario.correo,
      role: 'client',
    },
    expiresAt: Date.parse(response.expiraEn),
  };
}

import { Injectable } from '@angular/core';
import { map, Observable, of, throwError, timer } from 'rxjs';
import {
  AuthenticationUnavailableError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from '../../core/auth/auth.errors';
import { AuthGateway } from '../../core/auth/auth.gateway';
import {
  AuthGrant,
  AuthSession,
  AuthUser,
  LoginCredentials,
  RegistrationData,
} from '../../core/auth/auth.models';

const DEMO_EMAIL = 'cliente@solventa.co';
const DEMO_PASSWORD = 'Solventa123!';
const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

@Injectable()
export class MockAuthGateway implements AuthGateway {
  private activeSession: AuthSession | null = null;

  register(data: RegistrationData): Observable<AuthUser> {
    return of({ id: 'client-002', name: data.name, email: data.email, role: 'client' as const });
  }

  login(credentials: LoginCredentials): Observable<AuthGrant> {
    return timer(650).pipe(
      map(() => {
        if (credentials.email === 'indisponible@solventa.co') {
          throw new AuthenticationUnavailableError();
        }
        if (credentials.email !== DEMO_EMAIL || credentials.password !== DEMO_PASSWORD) {
          throw new InvalidCredentialsError();
        }

        this.activeSession = {
          user: {
            id: 'client-001',
            name: 'Natalia Córdoba',
            email: DEMO_EMAIL,
            role: 'client',
            documentType: 'cc',
            nationalId: '1023456789',
            phone: '+573001234567',
          },
          expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        };
        return this.grant(this.activeSession);
      }),
    );
  }

  refresh(refreshToken: string): Observable<AuthGrant> {
    if (!this.activeSession || refreshToken !== MOCK_REFRESH_TOKEN) {
      return throwError(() => new InvalidRefreshTokenError());
    }
    return of(this.grant(this.activeSession));
  }

  currentSession(): Observable<AuthSession | null> {
    return of(this.activeSession);
  }

  logout(): Observable<void> {
    this.activeSession = null;
    return of(undefined);
  }

  private grant(session: AuthSession): AuthGrant {
    return {
      session,
      tokens: {
        accessToken: 'mock-access-token',
        refreshToken: MOCK_REFRESH_TOKEN,
        refreshExpiresAt: session.expiresAt,
      },
    };
  }
}

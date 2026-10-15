import { Injectable } from '@angular/core';
import { map, Observable, of, timer } from 'rxjs';
import {
  AuthenticationUnavailableError,
  InvalidCredentialsError,
} from '../../core/auth/auth.errors';
import { AuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession, LoginCredentials } from '../../core/auth/auth.models';

const DEMO_EMAIL = 'cliente@solventa.co';
const DEMO_PASSWORD = 'Solventa123!';

@Injectable()
export class MockAuthGateway implements AuthGateway {
  private activeSession: AuthSession | null = null;

  login(credentials: LoginCredentials): Observable<AuthSession> {
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
        return this.activeSession;
      }),
    );
  }

  currentSession(): Observable<AuthSession | null> {
    return of(this.activeSession);
  }

  logout(): Observable<void> {
    this.activeSession = null;
    return of(undefined);
  }
}

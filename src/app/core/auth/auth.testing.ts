import { Observable, of } from 'rxjs';
import { AuthGateway } from './auth.gateway';
import { AuthGrant, AuthSession, AuthUser, LoginCredentials, RegistrationData } from './auth.models';
import { AuthStorage, StoredAuth } from './auth-storage.service';

export const TEST_USER: AuthUser = {
  id: 'client-001',
  name: 'Cliente Solventa',
  email: 'cliente@solventa.co',
  role: 'client',
};

export function grantFor(accessToken: string, refreshToken: string, now = Date.now()): AuthGrant {
  return {
    session: { user: TEST_USER, expiresAt: now + 3_600_000 },
    tokens: { accessToken, refreshToken, refreshExpiresAt: now + 7 * 86_400_000 },
  };
}

export class TestAuthStorage implements AuthStorage {
  stored: StoredAuth | null = null;
  clearCalls = 0;

  read(): StoredAuth | null {
    return this.stored;
  }

  write(auth: StoredAuth): void {
    this.stored = auth;
  }

  clear(): void {
    this.clearCalls++;
    this.stored = null;
  }
}

/** Gateway de pruebas: `refresh` es controlable desde el test para simular concurrencia. */
export class TestAuthGateway implements AuthGateway {
  refreshCalls: string[] = [];
  logoutCalls: Array<string | null> = [];
  refreshResult: () => Observable<AuthGrant> = () => of(grantFor('access-2', 'refresh-2'));
  loginResult: () => Observable<AuthGrant> = () => of(grantFor('access-1', 'refresh-1'));
  logoutResult: () => Observable<void> = () => of(undefined);

  register(data: RegistrationData): Observable<AuthUser> {
    return of({ ...TEST_USER, name: data.name, email: data.email });
  }

  login(_credentials: LoginCredentials): Observable<AuthGrant> {
    return this.loginResult();
  }

  refresh(refreshToken: string): Observable<AuthGrant> {
    this.refreshCalls.push(refreshToken);
    return this.refreshResult();
  }

  currentSession(): Observable<AuthSession | null> {
    return of(grantFor('access-1', 'refresh-1').session);
  }

  logout(refreshToken: string | null): Observable<void> {
    this.logoutCalls.push(refreshToken);
    return this.logoutResult();
  }
}

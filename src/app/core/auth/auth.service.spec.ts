import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { AUTH_GATEWAY, AuthGateway } from './auth.gateway';
import { AuthSession } from './auth.models';
import { AuthService } from './auth.service';
import { AUTH_STORAGE, AuthStorage } from './auth-storage.service';

const ACTIVE_SESSION: AuthSession = {
  user: {
    id: 'client-001',
    name: 'Cliente Solventa',
    email: 'cliente@solventa.co',
    role: 'client',
  },
  expiresAt: Date.now() + 60_000,
};

class TestAuthGateway implements AuthGateway {
  login() {
    return of(ACTIVE_SESSION);
  }
}

class TestAuthStorage implements AuthStorage {
  stored: AuthSession | null = null;
  clearCalls = 0;

  read(): AuthSession | null {
    return this.stored;
  }

  write(session: AuthSession): void {
    this.stored = session;
  }

  clear(): void {
    this.clearCalls++;
    this.stored = null;
  }
}

describe('AuthService', () => {
  let storage: TestAuthStorage;

  beforeEach(() => {
    storage = new TestAuthStorage();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_GATEWAY, useClass: TestAuthGateway },
        { provide: AUTH_STORAGE, useValue: storage },
      ],
    });
  });

  it('stores the session after a successful login', async () => {
    const service = TestBed.inject(AuthService);

    await firstValueFrom(service.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }));

    expect(storage.stored).toEqual(ACTIVE_SESSION);
    expect(service.user()?.email).toBe('cliente@solventa.co');
  });

  it('restores a valid stored session', () => {
    storage.stored = ACTIVE_SESSION;

    const service = TestBed.inject(AuthService);

    expect(service.hasActiveSession()).toBe(true);
    expect(service.user()?.id).toBe('client-001');
  });

  it('discards an expired stored session', () => {
    storage.stored = { ...ACTIVE_SESSION, expiresAt: Date.now() - 1 };

    const service = TestBed.inject(AuthService);

    expect(service.hasActiveSession()).toBe(false);
    expect(storage.stored).toBeNull();
  });

  it('clears session state on logout', async () => {
    const service = TestBed.inject(AuthService);
    await firstValueFrom(service.login({ email: 'cliente@solventa.co', password: 'Solventa123!' }));

    service.logout();

    expect(service.session()).toBeNull();
    expect(storage.stored).toBeNull();
  });
});

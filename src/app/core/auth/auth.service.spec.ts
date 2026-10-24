import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { AuthenticationUnavailableError, InvalidRefreshTokenError } from './auth.errors';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthGrant } from './auth.models';
import { AuthService } from './auth.service';
import { AUTH_STORAGE, StoredAuth } from './auth-storage.service';
import { grantFor, TEST_USER, TestAuthGateway, TestAuthStorage } from './auth.testing';

const CREDENTIALS = { email: 'cliente@solventa.co', password: 'Solventa123!' };

describe('AuthService', () => {
  let storage: TestAuthStorage;
  let gateway: TestAuthGateway;

  function createService(): AuthService {
    return TestBed.inject(AuthService);
  }

  function storedAuth(overrides: Partial<StoredAuth> = {}): StoredAuth {
    return {
      user: TEST_USER,
      refreshToken: 'refresh-stored',
      refreshExpiresAt: Date.now() + 60_000,
      ...overrides,
    };
  }

  beforeEach(() => {
    storage = new TestAuthStorage();
    gateway = new TestAuthGateway();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AUTH_GATEWAY, useValue: gateway },
        { provide: AUTH_STORAGE, useValue: storage },
      ],
    });
  });

  it('keeps the access token in memory and stores only the refresh token after login', async () => {
    const service = createService();

    await firstValueFrom(service.login(CREDENTIALS));

    expect(storage.stored).toEqual({
      user: TEST_USER,
      refreshToken: 'refresh-1',
      refreshExpiresAt: expect.any(Number),
    });
    expect(JSON.stringify(storage.stored)).not.toContain('access-1');
    expect(service.user()?.email).toBe('cliente@solventa.co');
    await expect(firstValueFrom(service.getAccessToken())).resolves.toBe('access-1');
  });

  it('does not persist or log the login password on success or failure', async () => {
    const logs = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = logs.map((method) => vi.spyOn(console, method));
    try {
      const service = createService();
      await firstValueFrom(service.login(CREDENTIALS));
      expect(JSON.stringify(storage.stored)).not.toContain(CREDENTIALS.password);
      expect(JSON.stringify(service.session())).not.toContain(CREDENTIALS.password);
      gateway.loginResult = () => throwError(() => new AuthenticationUnavailableError());
      await expect(firstValueFrom(service.login(CREDENTIALS))).rejects.toBeInstanceOf(
        AuthenticationUnavailableError,
      );
      expect(JSON.stringify(storage.stored)).not.toContain(CREDENTIALS.password);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(CREDENTIALS.password);
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });

  it('restores the session from a stored refresh token without an access token', async () => {
    storage.stored = storedAuth();

    const service = createService();

    expect(service.hasActiveSession()).toBe(true);
    expect(service.user()?.id).toBe('client-001');

    await firstValueFrom(service.synchronizeSession());

    expect(gateway.refreshCalls).toEqual(['refresh-stored']);
    expect(storage.stored?.refreshToken).toBe('refresh-2');
    await expect(firstValueFrom(service.getAccessToken())).resolves.toBe('access-2');
  });

  it('discards an expired stored refresh token', () => {
    storage.stored = storedAuth({ refreshExpiresAt: Date.now() - 1 });

    const service = createService();

    expect(service.hasActiveSession()).toBe(false);
    expect(storage.stored).toBeNull();
  });

  it('silently becomes unauthenticated when the stored refresh token is rejected', async () => {
    storage.stored = storedAuth();
    gateway.refreshResult = () => throwError(() => new InvalidRefreshTokenError());
    const service = createService();

    await expect(firstValueFrom(service.synchronizeSession())).resolves.toBeUndefined();

    expect(service.session()).toBeNull();
    expect(storage.stored).toBeNull();
  });

  it('keeps the stored session when the backend is temporarily unavailable', async () => {
    storage.stored = storedAuth();
    gateway.refreshResult = () => throwError(() => new AuthenticationUnavailableError());
    const service = createService();

    await expect(firstValueFrom(service.synchronizeSession())).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    );

    expect(service.hasActiveSession()).toBe(true);
    expect(storage.stored).not.toBeNull();
  });

  it('does nothing when there is no stored session', async () => {
    const service = createService();

    await firstValueFrom(service.synchronizeSession());

    expect(gateway.refreshCalls).toEqual([]);
    expect(service.session()).toBeNull();
  });

  it('shares one refresh request between concurrent callers', async () => {
    storage.stored = storedAuth();
    const pending = new Subject<AuthGrant>();
    gateway.refreshResult = () => pending;
    const service = createService();

    const results = Promise.all([
      firstValueFrom(service.renewAccessToken()),
      firstValueFrom(service.renewAccessToken()),
      firstValueFrom(service.getAccessToken()),
    ]);
    pending.next(grantFor('access-2', 'refresh-2'));
    pending.complete();

    await expect(results).resolves.toEqual(['access-2', 'access-2', 'access-2']);
    expect(gateway.refreshCalls).toEqual(['refresh-stored']);
  });

  it('reuses a token renewed after the rejected one was issued', async () => {
    const service = createService();
    await firstValueFrom(service.login(CREDENTIALS));

    await firstValueFrom(service.renewAccessToken('access-1'));
    const reused = await firstValueFrom(service.renewAccessToken('access-1'));

    expect(reused).toBe('access-2');
    expect(gateway.refreshCalls).toEqual(['refresh-1']);
  });

  it('renews an access token that is about to expire', async () => {
    gateway.loginResult = () => {
      const grant = grantFor('access-1', 'refresh-1');
      return of({ ...grant, session: { ...grant.session, expiresAt: Date.now() + 1_000 } });
    };
    const service = createService();
    await firstValueFrom(service.login(CREDENTIALS));

    await expect(firstValueFrom(service.getAccessToken())).resolves.toBe('access-2');
  });

  it('has no access token without a session', async () => {
    const service = createService();

    await expect(firstValueFrom(service.getAccessToken())).resolves.toBeNull();
  });

  it('clears local state when the refresh token is invalid', async () => {
    const service = createService();
    await firstValueFrom(service.login(CREDENTIALS));
    gateway.refreshResult = () => throwError(() => new InvalidRefreshTokenError());

    await expect(firstValueFrom(service.renewAccessToken())).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );

    expect(service.session()).toBeNull();
    expect(storage.stored).toBeNull();
  });

  it('sends the refresh token on logout and clears the session', async () => {
    const service = createService();
    await firstValueFrom(service.login(CREDENTIALS));

    await firstValueFrom(service.logout());

    expect(gateway.logoutCalls).toEqual(['refresh-1']);
    expect(service.session()).toBeNull();
    expect(storage.stored).toBeNull();
  });

  it('clears local state even if the remote logout fails', async () => {
    const service = createService();
    await firstValueFrom(service.login(CREDENTIALS));
    gateway.logoutResult = () => throwError(() => new AuthenticationUnavailableError());

    await expect(firstValueFrom(service.logout())).rejects.toBeInstanceOf(
      AuthenticationUnavailableError,
    );

    expect(service.session()).toBeNull();
    expect(storage.stored).toBeNull();
  });

  it('registers a user without opening a session', async () => {
    const service = createService();

    const user = await firstValueFrom(
      service.register({ name: 'Ana', email: 'ana@solventa.co', password: 'Solventa123!' }),
    );

    expect(user.email).toBe('ana@solventa.co');
    expect(service.session()).toBeNull();
  });
});

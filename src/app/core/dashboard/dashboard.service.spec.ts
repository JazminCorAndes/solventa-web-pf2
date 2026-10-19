import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, of, Subject, throwError } from 'rxjs';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { TEST_USER } from '../auth/auth.testing';
import { DASHBOARD_GATEWAY, DashboardGateway } from './dashboard.gateway';
import { DashboardSnapshot } from './dashboard.models';
import { DashboardService } from './dashboard.service';
import { DASHBOARD_SNAPSHOT, EMPTY_DASHBOARD } from './dashboard.testing';

class TestDashboardGateway implements DashboardGateway {
  calls = 0;
  response: Observable<DashboardSnapshot> = of(DASHBOARD_SNAPSHOT);

  load() {
    this.calls++;
    return this.response;
  }
}

describe('DashboardService', () => {
  const user = signal<AuthUser | null>(TEST_USER);
  let service: DashboardService;
  let gateway: TestDashboardGateway;

  beforeEach(() => {
    user.set(TEST_USER);
    TestBed.configureTestingModule({
      providers: [
        DashboardService,
        { provide: AuthService, useValue: { user } },
        { provide: DASHBOARD_GATEWAY, useClass: TestDashboardGateway },
      ],
    });
    service = TestBed.inject(DashboardService);
    gateway = TestBed.inject(DASHBOARD_GATEWAY) as TestDashboardGateway;
  });

  it('loads persisted records without deriving policy metrics', () => {
    service.load();
    expect(service.status()).toBe('ready');
    expect(service.snapshot()).toEqual(DASHBOARD_SNAPSHOT);
  });

  it('distinguishes a valid empty response from unavailable domains', () => {
    gateway.response = of(EMPTY_DASHBOARD);
    service.load();
    expect(service.status()).toBe('ready');
    expect(service.snapshot()?.quotes).toEqual([]);
    expect(service.snapshot()?.policies).toEqual([]);
  });

  it('prevents duplicate loads while a request is pending', () => {
    gateway.response = new Subject<DashboardSnapshot>();
    service.load();
    service.load();
    expect(gateway.calls).toBe(1);
    expect(service.status()).toBe('loading');
    expect(service.snapshot()).toBeNull();
  });

  it('clears stale data on failure and allows retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.load();
    gateway.response = throwError(() => new Error('unavailable'));
    service.load();
    expect(service.status()).toBe('error');
    expect(service.snapshot()).toBeNull();
    gateway.response = of(EMPTY_DASHBOARD);
    service.load();
    expect(service.status()).toBe('ready');
  });

  it('does not turn an empty observable into a successful empty account', () => {
    gateway.response = EMPTY;
    service.load();
    expect(service.status()).toBe('error');
    expect(service.snapshot()).toBeNull();
  });

  it('hides account data immediately on logout and does not load anonymously', () => {
    service.load();
    user.set(null);
    expect(service.snapshot()).toBeNull();
    expect(service.status()).toBe('idle');
    TestBed.tick();
    service.load();
    expect(gateway.calls).toBe(1);
  });

  it('cancels pending requests on user changes and ignores late responses', () => {
    const pending = new Subject<DashboardSnapshot>();
    gateway.response = pending;
    service.load();
    user.set({ ...TEST_USER, id: 'client-002' });
    expect(service.snapshot()).toBeNull();
    TestBed.tick();
    expect(pending.observed).toBe(false);
    pending.next(DASHBOARD_SNAPSHOT);
    expect(service.snapshot()).toBeNull();
    gateway.response = of(EMPTY_DASHBOARD);
    service.load();
    expect(service.snapshot()).toEqual(EMPTY_DASHBOARD);
  });

  it('never exposes a cached account to a different logged-in user', () => {
    service.load();
    expect(service.snapshot()).toEqual(DASHBOARD_SNAPSHOT);
    user.set({ ...TEST_USER, id: 'client-002' });
    expect(service.snapshot()).toBeNull();
    expect(service.status()).toBe('idle');
    gateway.response = of(EMPTY_DASHBOARD);
    service.load();
    expect(service.snapshot()).toEqual(EMPTY_DASHBOARD);
    TestBed.tick();
    expect(service.snapshot()).toEqual(EMPTY_DASHBOARD);
    expect(gateway.calls).toBe(2);
  });

  it('rejects a late response even before the user-change effect runs', () => {
    const pending = new Subject<DashboardSnapshot>();
    gateway.response = pending;
    service.load();
    user.set({ ...TEST_USER, id: 'client-002' });
    pending.next(DASHBOARD_SNAPSHOT);
    expect(service.snapshot()).toBeNull();
    service.load();
    expect(gateway.calls).toBe(2);
  });

  afterEach(() => vi.restoreAllMocks());
});

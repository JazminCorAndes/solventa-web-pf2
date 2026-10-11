import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { DASHBOARD_GATEWAY, DashboardGateway } from './dashboard.gateway';
import { DashboardSnapshot } from './dashboard.models';
import { DashboardService } from './dashboard.service';

const SNAPSHOT: DashboardSnapshot = {
  upcomingTrip: 'Madrid',
  policies: [
    { id: '1', product: 'Viaje', premiumCop: 100000, status: 'active' },
    { id: '2', product: 'Vida', premiumCop: 120000, status: 'pending' },
  ],
  notifications: [
    { id: '1', title: 'Nueva', createdAt: '2026-10-10T00:00:00Z', read: false },
    { id: '2', title: 'Leída', createdAt: '2026-10-09T00:00:00Z', read: true },
  ],
};

class TestDashboardGateway implements DashboardGateway {
  calls = 0;
  response = of(SNAPSHOT);

  load() {
    this.calls++;
    return this.response;
  }
}

describe('DashboardService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DashboardService, { provide: DASHBOARD_GATEWAY, useClass: TestDashboardGateway }],
    });
  });

  it('loads dashboard metrics', () => {
    const service = TestBed.inject(DashboardService);

    service.load();

    expect(service.status()).toBe('ready');
    expect(service.activePolicies()).toBe(1);
    expect(service.unreadNotifications()).toBe(1);
  });

  it('prevents duplicate loads while a request is pending', () => {
    const gateway = TestBed.inject(DASHBOARD_GATEWAY) as TestDashboardGateway;
    gateway.response = new Subject<DashboardSnapshot>();
    const service = TestBed.inject(DashboardService);

    service.load();
    service.load();

    expect(gateway.calls).toBe(1);
  });
});

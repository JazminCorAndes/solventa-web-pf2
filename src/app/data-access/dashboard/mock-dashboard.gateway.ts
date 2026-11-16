import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { DashboardGateway } from '../../core/dashboard/dashboard.gateway';
import { DashboardSnapshot } from '../../core/dashboard/dashboard.models';
import { MOCK_POLICY_ID } from '../mock/mock.constants';

@Injectable()
export class MockDashboardGateway implements DashboardGateway {
  load(): Observable<DashboardSnapshot> {
    return of({
      quotes: [],
      subscriptions: [],
      payments: [],
      policies: [
        {
          id: MOCK_POLICY_ID,
          subscriptionId: '30000000-0000-4000-8000-000000000001',
          type: 'automotive',
          startDate: '2026-11-01',
          endDate: '2026-12-31',
          status: 'vigente',
          simulated: true,
        },
      ],
      notifications: { availability: 'no_implementado' },
    });
  }
}

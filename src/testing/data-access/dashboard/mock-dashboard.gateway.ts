import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { DashboardGateway } from '../../../app/core/dashboard/dashboard.gateway';
import { DashboardSnapshot } from '../../../app/core/dashboard/dashboard.models';
import { MOCK_POLICY_ID } from '../mock/mock.constants';
import { MockPolicyCancellationGateway } from '../policies/mock-policy-cancellation.gateway';

@Injectable()
export class MockDashboardGateway implements DashboardGateway {
  private readonly cancellations = inject(MockPolicyCancellationGateway);

  load(): Observable<DashboardSnapshot> {
    return this.cancellations.state(MOCK_POLICY_ID).pipe(
      map((state) => ({
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
            status: state.state === 'cancelada' ? 'cancelada' : 'vigente',
            simulated: true,
          },
        ],
        notifications: { availability: 'no_implementado' },
      })),
    );
  }
}

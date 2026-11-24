import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MockDashboardGateway } from '../../../testing/data-access/dashboard/mock-dashboard.gateway';
import { MOCK_POLICY_ID } from '../../../testing/data-access/mock/mock.constants';
import { MockPolicyCancellationGateway } from '../../../testing/data-access/policies/mock-policy-cancellation.gateway';

describe('Academic policy cancellation mock', () => {
  it('replays the same request and reflects cancellation on return to policies', async () => {
    TestBed.configureTestingModule({ providers: [MockDashboardGateway] });
    const gateway = TestBed.inject(MockPolicyCancellationGateway);
    const state = await firstValueFrom(gateway.state(MOCK_POLICY_ID));
    const attempt = {
      key: crypto.randomUUID(),
      reason: 'costo' as const,
      settlementHash: state.settlement!.settlementHash,
    };
    const result = await firstValueFrom(gateway.cancel(MOCK_POLICY_ID, attempt));
    expect(await firstValueFrom(gateway.cancel(MOCK_POLICY_ID, attempt))).toEqual(result);
    expect((await firstValueFrom(gateway.state(MOCK_POLICY_ID))).cancellation).toEqual(result);
    const dashboard = await firstValueFrom(TestBed.inject(MockDashboardGateway).load());
    expect(dashboard.policies[0].status).toBe('cancelada');
    await expect(
      firstValueFrom(gateway.cancel(MOCK_POLICY_ID, { ...attempt, reason: 'otro' })),
    ).rejects.toMatchObject({ kind: 'key-conflict' });
  });
});

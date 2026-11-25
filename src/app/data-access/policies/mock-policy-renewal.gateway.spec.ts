import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_POLICY_ID } from '../../../testing/data-access/mock/mock.constants';
import { MockPolicyRenewalGateway } from '../../../testing/data-access/policies/mock-policy-renewal.gateway';

const KEY = '11111111-1111-4111-8111-111111111111';

describe('MockPolicyRenewalGateway', () => {
  let gateway: MockPolicyRenewalGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MockPolicyRenewalGateway] });
    gateway = TestBed.inject(MockPolicyRenewalGateway);
  });

  it('renews the demo policy and keeps the idempotent result', async () => {
    const eligibility = await firstValueFrom(gateway.eligibility(MOCK_POLICY_ID));
    expect(eligibility.renewable).toBe(true);
    expect(eligibility.offer?.premium.amount).toBe('85000');

    const first = await firstValueFrom(
      gateway.renew(MOCK_POLICY_ID, eligibility.offer!.conditionsHash, KEY),
    );
    const replay = await firstValueFrom(
      gateway.renew(MOCK_POLICY_ID, eligibility.offer!.conditionsHash, KEY),
    );

    expect(first.renewal.state).toBe('renovada');
    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ renewal: first.renewal, replayed: true });
    expect((await firstValueFrom(gateway.eligibility(MOCK_POLICY_ID))).renewable).toBe(false);
  });

  it('rejects unknown policies and changed conditions', async () => {
    await expect(
      firstValueFrom(gateway.eligibility('00000000-0000-4000-8000-000000000000')),
    ).rejects.toMatchObject({ kind: 'not-found' });
    await expect(
      firstValueFrom(gateway.renew(MOCK_POLICY_ID, 'd'.repeat(64), KEY)),
    ).rejects.toMatchObject({ kind: 'conditions-changed' });
  });
});

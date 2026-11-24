import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ModificationProposal } from '../../core/policies/policy-modification.models';
import { MOCK_POLICY_ID } from '../../../testing/data-access/mock/mock.constants';
import { MockPolicyModificationGateway } from '../../../testing/data-access/policies/mock-policy-modification.gateway';

const KEY = '22222222-2222-4222-8222-222222222222';
const PROPOSAL: ModificationProposal = {
  baseVersion: 1,
  plan: 'premium',
  optionalCoverages: [],
};

describe('MockPolicyModificationGateway', () => {
  let gateway: MockPolicyModificationGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MockPolicyModificationGateway] });
    gateway = TestBed.inject(MockPolicyModificationGateway);
  });

  it('simulates and confirms a versioned policy modification', async () => {
    const state = await firstValueFrom(gateway.state(MOCK_POLICY_ID));
    expect(state.currentVersion?.plan).toBe('esencial');

    const impact = await firstValueFrom(gateway.simulate(MOCK_POLICY_ID, PROPOSAL));
    expect(impact.newPlan).toBe('premium');
    expect(impact.removed).toEqual(['asistencia_carretera']);

    const result = await firstValueFrom(
      gateway.confirm(MOCK_POLICY_ID, PROPOSAL, impact.impactHash, KEY),
    );
    expect(result.previousVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(result.version.plan).toBe('premium');
    expect((await firstValueFrom(gateway.state(MOCK_POLICY_ID))).history).toHaveLength(2);
  });

  it('does not confirm an impact that was not simulated', async () => {
    await expect(
      firstValueFrom(gateway.confirm(MOCK_POLICY_ID, PROPOSAL, 'f'.repeat(64), KEY)),
    ).rejects.toMatchObject({ kind: 'impact-changed' });
  });
});

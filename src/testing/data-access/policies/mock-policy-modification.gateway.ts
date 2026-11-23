import { Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { PolicyModificationGateway } from '../../../app/core/policies/policy-modification.gateway';
import {
  ModificationImpact,
  ModificationProposal,
  ModificationResult,
  ModificationState,
  Plan,
  PolicyCoverage,
  PolicyModificationError,
  PolicyVersion,
} from '../../../app/core/policies/policy-modification.models';
import { MOCK_POLICY_ID } from '../mock/mock.constants';

const PLAN_PRICES: Record<Plan, number> = {
  esencial: 77000,
  integral: 90000,
  premium: 100100,
};
const OPTIONAL_PRICE = 8000;

@Injectable()
export class MockPolicyModificationGateway implements PolicyModificationGateway {
  private current = this.version(1, 'esencial', ['asistencia_carretera'], 'emision', null);
  private readonly history: PolicyVersion[] = [this.current];
  private readonly simulations = new Map<string, ModificationImpact>();
  private readonly confirmations = new Map<
    string,
    { impactHash: string; result: ModificationResult }
  >();

  state(policyId: string): Observable<ModificationState> {
    return defer(() => {
      this.assertPolicy(policyId);
      const state: ModificationState = {
        policyId,
        type: 'automotive',
        period: { start: '2026-11-01', end: '2026-12-31' },
        modifiable: true,
        reason: null,
        currentVersion: structuredClone(this.current),
        options: {
          plans: [
            { code: 'esencial', name: 'Esencial', factor: '1.00' },
            { code: 'integral', name: 'Integral', factor: '1.17' },
            { code: 'premium', name: 'Premium', factor: '1.30' },
          ],
          optionalCoverages: [
            {
              code: 'asistencia_carretera',
              name: 'Asistencia en carretera',
              surcharge: { amount: String(OPTIONAL_PRICE), currency: 'COP' },
            },
          ],
        },
        history: structuredClone(this.history),
      };
      return of(state);
    });
  }

  simulate(policyId: string, proposal: ModificationProposal): Observable<ModificationImpact> {
    return defer(() => {
      this.assertPolicy(policyId);
      this.validateProposal(proposal);
      const impact = this.impact(proposal);
      this.simulations.set(impact.impactHash, impact);
      return of(structuredClone(impact));
    });
  }

  confirm(
    policyId: string,
    proposal: ModificationProposal,
    impactHash: string,
    idempotencyKey: string,
  ): Observable<ModificationResult> {
    return defer(() => {
      this.assertPolicy(policyId);
      const replay = this.confirmations.get(idempotencyKey);
      if (replay) {
        if (replay.impactHash !== impactHash) {
          throw new PolicyModificationError('key-conflict');
        }
        return of(structuredClone(replay.result));
      }
      this.validateProposal(proposal);
      const impact = this.simulations.get(impactHash);
      if (!impact || !this.sameProposal(impact, proposal)) {
        throw new PolicyModificationError('impact-changed');
      }

      const endorsementId = crypto.randomUUID();
      const previousVersion = this.current.version;
      const version = this.version(
        previousVersion + 1,
        proposal.plan,
        proposal.optionalCoverages,
        'modificacion',
        endorsementId,
      );
      const result: ModificationResult = {
        endorsementId,
        policyId,
        previousVersion,
        newVersion: version.version,
        version,
        impact,
        createdAt: new Date().toISOString(),
      };
      this.current = version;
      this.history.unshift(version);
      this.confirmations.set(idempotencyKey, { impactHash, result });
      return of(structuredClone(result));
    });
  }

  private validateProposal(proposal: ModificationProposal): void {
    if (proposal.baseVersion !== this.current.version) {
      throw new PolicyModificationError('outdated-version');
    }
    if (!['esencial', 'integral', 'premium'].includes(proposal.plan)) {
      throw new PolicyModificationError('not-allowed', null, 'plan');
    }
    if (
      new Set(proposal.optionalCoverages).size !== proposal.optionalCoverages.length ||
      proposal.optionalCoverages.some((code) => code !== 'asistencia_carretera')
    ) {
      throw new PolicyModificationError('not-allowed', null, 'coberturasOpcionales');
    }
    const currentOptionals = this.current.coverages
      .filter((coverage) => coverage.optional && coverage.included)
      .map((coverage) => coverage.code)
      .sort();
    if (
      proposal.plan === this.current.plan &&
      currentOptionals.join('|') === [...proposal.optionalCoverages].sort().join('|')
    ) {
      throw new PolicyModificationError('no-changes');
    }
  }

  private impact(proposal: ModificationProposal): ModificationImpact {
    const oldOptionals = this.current.coverages
      .filter((coverage) => coverage.optional && coverage.included)
      .map((coverage) => coverage.code);
    const nextOptionals = [...proposal.optionalCoverages].sort();
    const previous = Number(this.current.premium.amount);
    const next = this.price(proposal.plan, nextOptionals);
    const difference = next - previous;
    const hashSuffix =
      proposal.plan === 'esencial' ? '1' : proposal.plan === 'integral' ? '2' : '3';
    return {
      baseVersion: proposal.baseVersion,
      previousPlan: this.current.plan,
      newPlan: proposal.plan,
      coverages: this.coverages(nextOptionals),
      added: nextOptionals.filter((code) => !oldOptionals.includes(code)),
      removed: oldOptionals.filter((code) => !nextOptionals.includes(code)),
      previousPremium: { amount: String(previous), currency: 'COP' },
      newPremium: { amount: String(next), currency: 'COP' },
      monthlyDifference: { amount: String(difference), currency: 'COP' },
      proratedAdjustment: {
        amount: String(Math.round((difference * 46) / 61)),
        currency: 'COP',
      },
      remainingDays: 46,
      effectiveFrom: '2026-11-16',
      period: { start: '2026-11-01', end: '2026-12-31' },
      impactHash: `${'e'.repeat(63)}${hashSuffix}`,
    };
  }

  private version(
    version: number,
    plan: Plan,
    optionalCoverages: string[],
    origin: 'emision' | 'modificacion',
    endorsementId: string | null,
  ): PolicyVersion {
    return {
      version,
      plan,
      coverages: this.coverages(optionalCoverages),
      premium: { amount: String(this.price(plan, optionalCoverages)), currency: 'COP' },
      effectiveFrom: version === 1 ? '2026-11-01' : '2026-11-16',
      origin,
      endorsementId,
      createdAt: version === 1 ? '2026-11-01T15:00:00Z' : new Date().toISOString(),
    };
  }

  private coverages(optionalCoverages: string[]): PolicyCoverage[] {
    return [
      {
        code: 'danos_vehiculo',
        name: 'Daños al vehículo',
        description: 'Daños accidentales sufridos por el vehículo asegurado.',
        optional: false,
        included: true,
      },
      {
        code: 'asistencia_carretera',
        name: 'Asistencia en carretera',
        description: 'Acompañamiento ante inmovilización o emergencia.',
        optional: true,
        included: optionalCoverages.includes('asistencia_carretera'),
      },
    ];
  }

  private price(plan: Plan, optionalCoverages: string[]): number {
    return (
      PLAN_PRICES[plan] + (optionalCoverages.includes('asistencia_carretera') ? OPTIONAL_PRICE : 0)
    );
  }

  private sameProposal(impact: ModificationImpact, proposal: ModificationProposal): boolean {
    const included = impact.coverages
      .filter((coverage) => coverage.optional && coverage.included)
      .map((coverage) => coverage.code)
      .sort();
    return (
      impact.baseVersion === proposal.baseVersion &&
      impact.newPlan === proposal.plan &&
      included.join('|') === [...proposal.optionalCoverages].sort().join('|')
    );
  }

  private assertPolicy(policyId: string): void {
    if (policyId !== MOCK_POLICY_ID) {
      throw new PolicyModificationError('not-found');
    }
  }
}

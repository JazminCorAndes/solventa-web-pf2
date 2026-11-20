import { Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { PolicyCancellationGateway } from '../../core/policies/policy-cancellation.gateway';
import {
  CancellationAttempt,
  CancellationSettlement,
  CancellationState,
  PolicyCancellation,
  PolicyCancellationError,
} from '../../core/policies/policy-cancellation.models';
import { MOCK_POLICY_ID } from '../mock/mock.constants';

const SETTLEMENT: CancellationSettlement = {
  effectiveDate: '2026-11-21',
  coverageEnd: '2026-11-21',
  endedCoverages: [{ code: 'danos_vehiculo', name: 'Daños al vehículo' }],
  currentPeriod: { start: '2026-11-01', end: '2026-11-30' },
  voidedPeriods: [
    { start: '2026-12-01', end: '2026-12-31', premium: { amount: '85000', currency: 'COP' } },
  ],
  monthlyPremium: { amount: '85000', currency: 'COP' },
  periodDays: 30,
  unusedDays: 9,
  proratedRefund: { amount: '25500', currency: 'COP' },
  voidedRefund: { amount: '85000', currency: 'COP' },
  refund: { amount: '110500', currency: 'COP' },
  pendingAmount: { amount: '0', currency: 'COP' },
  ruleVersion: 'mock-cancelacion-v1',
  settlementHash: 'c'.repeat(64),
};

@Injectable({ providedIn: 'root' })
export class MockPolicyCancellationGateway implements PolicyCancellationGateway {
  private cancellation: PolicyCancellation | null = null;
  private readonly attempts = new Map<
    string,
    { attempt: CancellationAttempt; result: PolicyCancellation }
  >();

  state(policyId: string): Observable<CancellationState> {
    return defer(() => {
      this.assertPolicy(policyId);
      return of(
        structuredClone({
          policyId,
          type: 'automotive',
          state: this.cancellation ? 'cancelada' : 'activa',
          period: { start: '2026-11-01', end: '2026-12-31' },
          cancellable: this.cancellation === null,
          reason: this.cancellation ? 'poliza_cancelada' : null,
          settlement: this.cancellation ? null : SETTLEMENT,
          cancellation: this.cancellation,
        } satisfies CancellationState),
      );
    });
  }

  cancel(policyId: string, attempt: CancellationAttempt): Observable<PolicyCancellation> {
    return defer(() => {
      this.assertPolicy(policyId);
      const previous = this.attempts.get(attempt.key);
      if (previous) {
        if (
          previous.attempt.reason !== attempt.reason ||
          previous.attempt.settlementHash !== attempt.settlementHash
        )
          throw new PolicyCancellationError('key-conflict');
        return of(structuredClone(previous.result));
      }
      if (this.cancellation) throw new PolicyCancellationError('not-cancellable');
      if (attempt.settlementHash !== SETTLEMENT.settlementHash) {
        throw new PolicyCancellationError('settlement-changed');
      }
      const result: PolicyCancellation = {
        id: crypto.randomUUID(),
        policyId,
        state: 'cancelada',
        reason: attempt.reason,
        effectiveDate: SETTLEMENT.effectiveDate,
        settlement: structuredClone(SETTLEMENT),
        confirmedAt: new Date().toISOString(),
        simulated: true,
      };
      this.cancellation = result;
      this.attempts.set(attempt.key, { attempt: { ...attempt }, result });
      return of(structuredClone(result));
    });
  }

  private assertPolicy(policyId: string): void {
    if (policyId !== MOCK_POLICY_ID) throw new PolicyCancellationError('not-found');
  }
}

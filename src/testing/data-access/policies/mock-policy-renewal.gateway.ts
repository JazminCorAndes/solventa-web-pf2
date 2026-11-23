import { Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { PolicyRenewalGateway } from '../../../app/core/policies/policy-renewal.gateway';
import {
  PolicyRenewalError,
  Renewal,
  RenewalEligibility,
  RenewalSubmission,
} from '../../../app/core/policies/policy-renewal.models';
import { MOCK_POLICY_ID } from '../mock/mock.constants';

const CONDITIONS_HASH = 'c'.repeat(64);

@Injectable()
export class MockPolicyRenewalGateway implements PolicyRenewalGateway {
  private readonly attempts = new Map<
    string,
    { conditionsHash: string; submission: RenewalSubmission }
  >();
  private lastAttempt: Renewal | null = null;

  eligibility(policyId: string): Observable<RenewalEligibility> {
    return defer(() => {
      this.assertPolicy(policyId);
      const renewed = this.lastAttempt?.state === 'renovada';
      const eligibility: RenewalEligibility = {
        policyId,
        type: 'automotive',
        currentPeriod: renewed
          ? { start: '2027-01-01', end: '2027-12-31' }
          : { start: '2026-11-01', end: '2026-12-31' },
        renewable: !renewed,
        reason: renewed ? 'poliza_programada' : null,
        window: { from: '2026-11-01', to: '2026-12-31' },
        offer: renewed
          ? null
          : {
              policyId,
              product: 'Seguro de vehículo',
              previousEnd: '2026-12-31',
              newPeriod: { start: '2027-01-01', end: '2027-12-31' },
              coverages: [
                {
                  name: 'Daños al vehículo',
                  description: 'Protección por daños accidentales del vehículo asegurado.',
                },
                {
                  name: 'Asistencia en carretera',
                  description: 'Acompañamiento durante una emergencia vial.',
                },
              ],
              premium: { amount: '85000', currency: 'COP', frequency: 'mensual' },
              conditions: [
                'La información declarada debe permanecer vigente.',
                'La renovación conserva las coberturas seleccionadas.',
              ],
              requiresPayment: true,
              ruleVersion: 'mock-renovacion-v1',
              conditionsHash: CONDITIONS_HASH,
            },
        lastAttempt: this.lastAttempt ? structuredClone(this.lastAttempt) : null,
      };
      return of(eligibility);
    });
  }

  renew(
    policyId: string,
    conditionsHash: string,
    idempotencyKey: string,
  ): Observable<RenewalSubmission> {
    return defer(() => {
      this.assertPolicy(policyId);
      const previous = this.attempts.get(idempotencyKey);
      if (previous) {
        if (previous.conditionsHash !== conditionsHash) {
          throw new PolicyRenewalError('key-conflict');
        }
        return of({ renewal: structuredClone(previous.submission.renewal), replayed: true });
      }
      if (conditionsHash !== CONDITIONS_HASH) {
        throw new PolicyRenewalError('conditions-changed');
      }
      const renewal: Renewal = {
        id: crypto.randomUUID(),
        policyId,
        state: 'renovada',
        reason: null,
        previousEnd: '2026-12-31',
        newPeriod: { start: '2027-01-01', end: '2027-12-31' },
        coverages: [
          {
            name: 'Daños al vehículo',
            description: 'Protección por daños accidentales del vehículo asegurado.',
          },
          {
            name: 'Asistencia en carretera',
            description: 'Acompañamiento durante una emergencia vial.',
          },
        ],
        premium: { amount: '85000', currency: 'COP', frequency: 'mensual' },
        conditions: [
          'La información declarada debe permanecer vigente.',
          'La renovación conserva las coberturas seleccionadas.',
        ],
        conditionsHash,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const submission = { renewal, replayed: false };
      this.lastAttempt = renewal;
      this.attempts.set(idempotencyKey, { conditionsHash, submission });
      return of(structuredClone(submission));
    });
  }

  private assertPolicy(policyId: string): void {
    if (policyId !== MOCK_POLICY_ID) {
      throw new PolicyRenewalError('not-found');
    }
  }
}

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ModificationImpact,
  ModificationProposal,
  ModificationResult,
  ModificationState,
} from './policy-modification.models';

export interface PolicyModificationGateway {
  state(policyId: string): Observable<ModificationState>;
  simulate(policyId: string, proposal: ModificationProposal): Observable<ModificationImpact>;
  confirm(
    policyId: string,
    proposal: ModificationProposal,
    impactHash: string,
    idempotencyKey: string,
  ): Observable<ModificationResult>;
}

export const POLICY_MODIFICATION_GATEWAY = new InjectionToken<PolicyModificationGateway>(
  'POLICY_MODIFICATION_GATEWAY',
);

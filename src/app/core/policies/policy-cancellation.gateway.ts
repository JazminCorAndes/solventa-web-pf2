import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CancellationAttempt,
  CancellationState,
  PolicyCancellation,
} from './policy-cancellation.models';

export interface PolicyCancellationGateway {
  state(policyId: string): Observable<CancellationState>;
  cancel(policyId: string, attempt: CancellationAttempt): Observable<PolicyCancellation>;
}

export const POLICY_CANCELLATION_GATEWAY = new InjectionToken<PolicyCancellationGateway>(
  'POLICY_CANCELLATION_GATEWAY',
);

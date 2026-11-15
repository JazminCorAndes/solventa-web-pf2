import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { RenewalEligibility, RenewalSubmission } from './policy-renewal.models';

export interface PolicyRenewalGateway {
  eligibility(policyId: string): Observable<RenewalEligibility>;
  renew(
    policyId: string,
    conditionsHash: string,
    idempotencyKey: string,
  ): Observable<RenewalSubmission>;
}

export const POLICY_RENEWAL_GATEWAY = new InjectionToken<PolicyRenewalGateway>(
  'POLICY_RENEWAL_GATEWAY',
);

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ClaimStatus } from './claim-status.models';

export interface ClaimStatusGateway {
  load(claimId: string): Observable<ClaimStatus>;
}

export const CLAIM_STATUS_GATEWAY = new InjectionToken<ClaimStatusGateway>('CLAIM_STATUS_GATEWAY');

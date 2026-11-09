import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ClaimInput, ClaimPolicy, ClaimRecord } from './claim.models';

export interface ClaimGateway {
  policies(): Observable<ClaimPolicy[]>;
  report(payload: ClaimInput, key: string): Observable<ClaimRecord>;
  load(id: string): Observable<ClaimRecord>;
}

export const CLAIM_GATEWAY = new InjectionToken<ClaimGateway>('CLAIM_GATEWAY');

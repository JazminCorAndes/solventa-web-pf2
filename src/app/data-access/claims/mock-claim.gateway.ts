import { inject, Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { ClaimGateway } from '../../core/claims/claim.gateway';
import {
  CLAIM_UUID,
  ClaimInput,
  ClaimPolicy,
  ClaimRecord,
  isClaimInput,
} from '../../core/claims/claim.models';
import { MockClaimsStore } from './mock-claims.store';

@Injectable()
export class MockClaimGateway implements ClaimGateway {
  private readonly store = inject(MockClaimsStore);

  list(): Observable<ClaimRecord[]> {
    return defer(() => of(this.store.list()));
  }

  policies(): Observable<ClaimPolicy[]> {
    return of(this.store.policies());
  }

  report(payload: ClaimInput, key: string): Observable<ClaimRecord> {
    return defer(() => {
      if (!CLAIM_UUID.test(key) || !isClaimInput(payload)) {
        throw new Error('Invalid mock claim attempt.');
      }
      return of(this.store.report(payload, key));
    });
  }

  load(id: string): Observable<ClaimRecord> {
    return defer(() => {
      const record = CLAIM_UUID.test(id) ? this.store.record(id) : null;
      if (!record) {
        throw new Error('Mock claim not found.');
      }
      return of(record);
    });
  }
}

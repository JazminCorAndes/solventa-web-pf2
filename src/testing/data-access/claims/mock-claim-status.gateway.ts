import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ClaimNotFoundError } from '../../../app/core/claims/claim-status.errors';
import { ClaimStatusGateway } from '../../../app/core/claims/claim-status.gateway';
import { ClaimStatus } from '../../../app/core/claims/claim-status.models';
import { MockClaimsStore } from './mock-claims.store';

@Injectable()
export class MockClaimStatusGateway implements ClaimStatusGateway {
  private readonly store = inject(MockClaimsStore);

  load(claimId: string): Observable<ClaimStatus> {
    const status = this.store.status(claimId);
    return status ? of(status) : throwError(() => new ClaimNotFoundError());
  }
}

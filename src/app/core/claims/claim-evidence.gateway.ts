import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ClaimEvidence,
  EvidencePolicy,
  EvidenceUpload,
  EvidenceUploadBody,
} from './claim-evidence.models';

export interface ClaimEvidenceGateway {
  policy(): Observable<EvidencePolicy>;
  list(claimId: string): Observable<ClaimEvidence[]>;
  start(claimId: string, request: EvidenceUploadBody, key: string): Observable<EvidenceUpload>;
  load(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload>;
  chunk(
    claimId: string,
    id: string,
    request: EvidenceUploadBody,
    offset: number,
    bytes: Blob,
  ): Observable<EvidenceUpload>;
  confirm(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload>;
  cancel(claimId: string, id: string): Observable<void>;
  content(claimId: string, evidence: ClaimEvidence): Observable<Blob>;
}

export const CLAIM_EVIDENCE_GATEWAY = new InjectionToken<ClaimEvidenceGateway>(
  'CLAIM_EVIDENCE_GATEWAY',
);

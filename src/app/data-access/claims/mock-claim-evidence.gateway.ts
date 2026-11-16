import { inject, Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { ClaimEvidenceGateway } from '../../core/claims/claim-evidence.gateway';
import {
  ClaimEvidence,
  EvidencePolicy,
  EvidenceUpload,
  EvidenceUploadBody,
} from '../../core/claims/claim-evidence.models';
import { MockClaimsStore } from './mock-claims.store';

interface StoredUpload {
  id: string;
  claimId: string;
  request: EvidenceUploadBody;
  state: EvidenceUpload['estado'];
  offset: number;
  chunks: Blob[];
}

@Injectable()
export class MockClaimEvidenceGateway implements ClaimEvidenceGateway {
  private readonly claims = inject(MockClaimsStore);
  private readonly uploads = new Map<string, StoredUpload>();
  private readonly attempts = new Map<string, string>();
  private readonly evidences = new Map<string, ClaimEvidence[]>();
  private readonly contents = new Map<string, Blob>();

  policy(): Observable<EvidencePolicy> {
    return of({
      maxCantidad: 10,
      maxChunkBytes: 1024 * 1024,
      maxVideoSeconds: 120,
      formatos: [
        { mimeType: 'image/jpeg', maxBytes: 10 * 1024 * 1024 },
        { mimeType: 'image/png', maxBytes: 10 * 1024 * 1024 },
        { mimeType: 'application/pdf', maxBytes: 20 * 1024 * 1024 },
        { mimeType: 'video/mp4', maxBytes: 100 * 1024 * 1024 },
      ],
    });
  }

  list(claimId: string): Observable<ClaimEvidence[]> {
    return defer(() => {
      this.assertClaim(claimId);
      return of(structuredClone(this.evidences.get(claimId) ?? []));
    });
  }

  start(claimId: string, request: EvidenceUploadBody, key: string): Observable<EvidenceUpload> {
    return defer(() => {
      this.assertClaim(claimId);
      const attemptKey = `${claimId}:${key}`;
      const previousId = this.attempts.get(attemptKey);
      if (previousId) {
        const previous = this.requiredUpload(claimId, previousId);
        this.assertRequest(previous.request, request);
        return of(this.response(previous));
      }
      if ((this.evidences.get(claimId)?.length ?? 0) >= 10) {
        throw new Error('Mock evidence quota exceeded.');
      }
      const upload: StoredUpload = {
        id: crypto.randomUUID(),
        claimId,
        request: structuredClone(request),
        state: 'pendiente',
        offset: 0,
        chunks: [],
      };
      this.uploads.set(upload.id, upload);
      this.attempts.set(attemptKey, upload.id);
      return of(this.response(upload));
    });
  }

  load(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload> {
    return defer(() => {
      const upload = this.requiredUpload(claimId, id);
      this.assertRequest(upload.request, request);
      return of(this.response(upload));
    });
  }

  chunk(
    claimId: string,
    id: string,
    request: EvidenceUploadBody,
    offset: number,
    bytes: Blob,
  ): Observable<EvidenceUpload> {
    return defer(() => {
      const upload = this.requiredUpload(claimId, id);
      this.assertRequest(upload.request, request);
      if (
        upload.state !== 'pendiente' ||
        offset !== upload.offset ||
        bytes.size <= 0 ||
        bytes.size > 1024 * 1024 ||
        upload.offset + bytes.size > request.tamanoBytes
      ) {
        throw new Error('Invalid mock evidence chunk.');
      }
      upload.chunks.push(bytes);
      upload.offset += bytes.size;
      return of(this.response(upload));
    });
  }

  confirm(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload> {
    return defer(() => {
      const upload = this.requiredUpload(claimId, id);
      this.assertRequest(upload.request, request);
      if (upload.state === 'confirmada') {
        return of(this.response(upload));
      }
      if (upload.state !== 'pendiente' || upload.offset !== request.tamanoBytes) {
        throw new Error('Incomplete mock evidence upload.');
      }
      const content = new Blob(upload.chunks, { type: request.mimeType });
      if (content.size !== request.tamanoBytes) {
        throw new Error('Invalid mock evidence content.');
      }
      upload.state = 'confirmada';
      const evidence: ClaimEvidence = {
        ...structuredClone(request),
        id,
        siniestroId: claimId,
        creadaEn: new Date().toISOString(),
      };
      const current = this.evidences.get(claimId) ?? [];
      if (!current.some((entry) => entry.id === id)) {
        this.evidences.set(claimId, [...current, evidence]);
        this.contents.set(id, content);
      }
      return of(this.response(upload));
    });
  }

  cancel(claimId: string, id: string): Observable<void> {
    return defer(() => {
      const upload = this.requiredUpload(claimId, id);
      if (upload.state === 'confirmada') {
        throw new Error('Confirmed mock evidence cannot be cancelled.');
      }
      upload.state = 'cancelada';
      return of(undefined);
    });
  }

  content(claimId: string, evidence: ClaimEvidence): Observable<Blob> {
    return defer(() => {
      this.assertClaim(claimId);
      const stored = (this.evidences.get(claimId) ?? []).find((entry) => entry.id === evidence.id);
      const content = this.contents.get(evidence.id);
      if (!stored || !content || stored.sha256 !== evidence.sha256) {
        throw new Error('Mock evidence not found.');
      }
      return of(content);
    });
  }

  private response(upload: StoredUpload): EvidenceUpload {
    return {
      ...structuredClone(upload.request),
      id: upload.id,
      siniestroId: upload.claimId,
      estado: upload.state,
      offset: upload.offset,
      evidenciaId: upload.state === 'confirmada' ? upload.id : null,
    };
  }

  private requiredUpload(claimId: string, id: string): StoredUpload {
    this.assertClaim(claimId);
    const upload = this.uploads.get(id);
    if (!upload || upload.claimId !== claimId) {
      throw new Error('Mock evidence upload not found.');
    }
    return upload;
  }

  private assertClaim(claimId: string): void {
    if (!this.claims.has(claimId)) {
      throw new Error('Mock claim not found.');
    }
  }

  private assertRequest(expected: EvidenceUploadBody, received: EvidenceUploadBody): void {
    if (
      expected.mimeType !== received.mimeType ||
      expected.tamanoBytes !== received.tamanoBytes ||
      expected.sha256 !== received.sha256
    ) {
      throw new Error('Mock evidence idempotency conflict.');
    }
  }
}

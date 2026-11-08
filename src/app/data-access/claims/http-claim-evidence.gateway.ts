import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ClaimEvidence,
  EVIDENCE_MIMES,
  EvidenceMime,
  EvidencePolicy,
  EvidenceUpload,
  EvidenceUploadBody,
} from '../../core/claims/claim-evidence.models';

@Injectable({ providedIn: 'root' })
export class HttpClaimEvidenceGateway {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1/siniestros`;

  policy(): Observable<EvidencePolicy> {
    return this.http.get<unknown>(`${this.base}/configuracion-evidencias`).pipe(
      map((response) => {
        const value = record(response);
        if (!Array.isArray(value['formatos']) || value['formatos'].length === 0) invalid();
        const formatos = value['formatos'].map((entry) => {
          const format = record(entry);
          return { mimeType: mime(format['mimeType']), maxBytes: positive(format['maxBytes']) };
        });
        if (new Set(formatos.map((format) => format.mimeType)).size !== formatos.length) invalid();
        const maxChunkBytes = positive(value['maxChunkBytes']);
        if (maxChunkBytes > 1048576) invalid();
        return {
          maxCantidad: positive(value['maxCantidad']),
          maxChunkBytes,
          maxVideoSeconds: positive(value['maxVideoSeconds']),
          formatos,
        };
      }),
    );
  }

  list(claimId: string): Observable<ClaimEvidence[]> {
    return this.http.get<unknown>(`${this.claimUrl(claimId)}/evidencias`).pipe(
      map((response) => {
        const entries = record(response)['evidencias'];
        if (!Array.isArray(entries)) invalid();
        const result = entries.map((entry): ClaimEvidence => {
          const value = record(entry);
          const evidence = {
            ...body(value),
            id: uuid(value['id']),
            siniestroId: uuid(value['siniestroId']),
            creadaEn: date(value['creadaEn']),
          };
          if (evidence.siniestroId.toLowerCase() !== claimId.toLowerCase()) invalid();
          return evidence;
        });
        if (new Set(result.map((entry) => entry.id)).size !== result.length) invalid();
        return result;
      }),
    );
  }

  start(claimId: string, request: EvidenceUploadBody, key: string): Observable<EvidenceUpload> {
    return this.http
      .post<unknown>(`${this.claimUrl(claimId)}/cargas`, request, {
        headers: new HttpHeaders({ 'Idempotency-Key': key }),
      })
      .pipe(map((response) => upload(response, claimId, request)));
  }

  load(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload> {
    return this.http
      .get<unknown>(this.uploadUrl(claimId, id))
      .pipe(map((response) => upload(response, claimId, request, id)));
  }

  chunk(
    claimId: string,
    id: string,
    request: EvidenceUploadBody,
    offset: number,
    bytes: Blob,
  ): Observable<EvidenceUpload> {
    return this.http
      .put<unknown>(`${this.uploadUrl(claimId, id)}/contenido`, bytes, {
        headers: new HttpHeaders({
          'Content-Type': 'application/octet-stream',
          'Upload-Offset': String(offset),
        }),
      })
      .pipe(map((response) => upload(response, claimId, request, id)));
  }

  confirm(claimId: string, id: string, request: EvidenceUploadBody): Observable<EvidenceUpload> {
    return this.http
      .post<unknown>(`${this.uploadUrl(claimId, id)}/confirmacion`, null)
      .pipe(map((response) => upload(response, claimId, request, id)));
  }

  cancel(claimId: string, id: string): Observable<void> {
    return this.http.delete<unknown>(this.uploadUrl(claimId, id), { observe: 'response' }).pipe(
      map((response) => {
        if (response.status !== 204 || response.body !== null) invalid();
      }),
    );
  }

  content(claimId: string, evidence: ClaimEvidence): Observable<Blob> {
    return this.http
      .get(`${this.claimUrl(claimId)}/evidencias/${encodeURIComponent(evidence.id)}/contenido`, {
        responseType: 'blob',
      })
      .pipe(
        map((blob) => {
          if (blob.size !== evidence.tamanoBytes || blob.type !== evidence.mimeType) invalid();
          return blob;
        }),
      );
  }

  private claimUrl(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}`;
  }

  private uploadUrl(claimId: string, id: string): string {
    return `${this.claimUrl(claimId)}/cargas/${encodeURIComponent(id)}`;
  }
}

function invalid(): never {
  throw new Error('Invalid claim evidence response.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalid();
}

function uuid(value: unknown): string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : invalid();
}

function date(value: unknown): string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : invalid();
}

function mime(value: unknown): EvidenceMime {
  return EVIDENCE_MIMES.find((candidate) => candidate === value) ?? invalid();
}

function body(value: Record<string, unknown>): EvidenceUploadBody {
  const sha256 = value['sha256'];
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) invalid();
  return { mimeType: mime(value['mimeType']), tamanoBytes: positive(value['tamanoBytes']), sha256 };
}

function upload(
  response: unknown,
  claimId: string,
  expected: EvidenceUploadBody,
  id?: string,
): EvidenceUpload {
  const value = record(response);
  const resultBody = body(value);
  const resultId = uuid(value['id']);
  const siniestroId = uuid(value['siniestroId']);
  const estado = value['estado'];
  const offset = value['offset'];
  const evidenciaId = value['evidenciaId'] === null ? null : uuid(value['evidenciaId']);
  if (
    siniestroId.toLowerCase() !== claimId.toLowerCase() ||
    (id && resultId.toLowerCase() !== id.toLowerCase()) ||
    resultBody.sha256 !== expected.sha256 ||
    resultBody.mimeType !== expected.mimeType ||
    resultBody.tamanoBytes !== expected.tamanoBytes ||
    (estado !== 'pendiente' && estado !== 'confirmada' && estado !== 'cancelada') ||
    typeof offset !== 'number' ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > expected.tamanoBytes ||
    (estado === 'confirmada' && (!evidenciaId || offset !== expected.tamanoBytes)) ||
    (estado !== 'confirmada' && evidenciaId !== null)
  )
    invalid();
  return { ...resultBody, id: resultId, siniestroId, estado, offset, evidenciaId };
}

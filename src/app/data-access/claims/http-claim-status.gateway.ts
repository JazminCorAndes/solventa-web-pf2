import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClaimNotFoundError } from '../../core/claims/claim-status.errors';
import { ClaimStatusGateway } from '../../core/claims/claim-status.gateway';
import {
  ClaimHistoryEntry,
  ClaimState,
  ClaimStatus,
  ClaimType,
  isClaimState,
} from '../../core/claims/claim-status.models';

@Injectable()
export class HttpClaimStatusGateway implements ClaimStatusGateway {
  private readonly http = inject(HttpClient);

  load(claimId: string): Observable<ClaimStatus> {
    return this.http
      .get<unknown>(
        `${environment.apiBaseUrl}/v1/clientes/me/siniestros/${encodeURIComponent(claimId)}`,
      )
      .pipe(
        map((response) => toClaimStatus(response, claimId)),
        catchError((error: unknown) =>
          throwError(() => (isNotFound(error) ? new ClaimNotFoundError() : error)),
        ),
      );
  }
}

function isNotFound(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return false;
  }
  const body: unknown = error.error;
  return (
    body !== null &&
    typeof body === 'object' &&
    (body as Record<string, unknown>)['code'] === 'siniestro_no_encontrado'
  );
}

function invalid(): never {
  throw new Error('The claim status response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function date(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) &&
    Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}

function state(value: unknown): ClaimState {
  return isClaimState(value) ? value : invalid();
}

function claimType(value: unknown): ClaimType {
  return value === 'asistido' || value === 'parametrico' ? value : invalid();
}

function toHistoryEntry(value: unknown): ClaimHistoryEntry {
  const fields = record(value);
  return {
    state: state(fields['estado']),
    description: text(fields['descripcion']),
    occurredAt: date(fields['ocurridoEn']),
  };
}

function toClaimStatus(response: unknown, requestedId: string): ClaimStatus {
  const fields = record(response);
  const history = Array.isArray(fields['historial'])
    ? fields['historial'].map(toHistoryEntry)
    : invalid();
  const claim: ClaimStatus = {
    id: text(fields['id']),
    policyId: text(fields['polizaId']),
    type: claimType(fields['tipo']),
    state: state(fields['estado']),
    description: text(fields['descripcion']),
    occurredAt: date(fields['ocurridoEn']),
    reportedAt: date(fields['reportadoEn']),
    updatedAt: date(fields['actualizadoEn']),
    history,
  };
  const latest = history.at(-1);
  if (
    claim.id.toLowerCase() !== requestedId.toLowerCase() ||
    !latest ||
    latest.state !== claim.state ||
    Date.parse(latest.occurredAt) !== Date.parse(claim.updatedAt)
  ) {
    invalid();
  }
  return claim;
}

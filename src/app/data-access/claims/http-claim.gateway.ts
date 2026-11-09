import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClaimGateway } from '../../core/claims/claim.gateway';
import {
  CLAIM_UUID,
  ClaimInput,
  ClaimPolicy,
  ClaimRecord,
  isClaimInput,
  isClaimRecord,
  isPolicyDate,
} from '../../core/claims/claim.models';

@Injectable()
export class HttpClaimGateway implements ClaimGateway {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/siniestros`;

  policies(): Observable<ClaimPolicy[]> {
    return this.http.get<{ polizas: ClaimPolicy[] }>(`${this.url}/polizas`).pipe(
      map((response) => {
        if (
          !Array.isArray(response?.polizas) ||
          !response.polizas.every(
            (policy) =>
              policy &&
              typeof policy.id === 'string' &&
              CLAIM_UUID.test(policy.id) &&
              typeof policy.tipo === 'string' &&
              !!policy.tipo &&
              typeof policy.estado === 'string' &&
              isPolicyDate(policy.fechaInicio) &&
              isPolicyDate(policy.fechaFin) &&
              policy.fechaInicio <= policy.fechaFin,
          )
        ) {
          throw new Error('Invalid claim policies response.');
        }
        return response.polizas.filter((policy) => policy.estado === 'vigente');
      }),
    );
  }

  report(payload: ClaimInput, key: string): Observable<ClaimRecord> {
    return defer(() => {
      if (!CLAIM_UUID.test(key) || !isClaimInput(payload)) {
        throw new Error('Invalid claim attempt.');
      }
      return this.http.post<unknown>(this.url, payload, {
        headers: { 'Idempotency-Key': key },
      });
    }).pipe(map(validateRecord));
  }

  load(id: string): Observable<ClaimRecord> {
    return defer(() => {
      if (!CLAIM_UUID.test(id)) throw new Error('Invalid claim identifier.');
      return this.http.get<unknown>(`${this.url}/${encodeURIComponent(id)}`);
    }).pipe(
      map(validateRecord),
      map((record) => {
        if (record.id !== id) throw new Error('The claim identifier does not match.');
        return record;
      }),
    );
  }
}

function validateRecord(value: unknown): ClaimRecord {
  if (!isClaimRecord(value)) throw new Error('Invalid claim confirmation.');
  return value;
}

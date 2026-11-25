import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { defer, map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdministrationGateway } from '../../core/administration/administration.gateway';
import {
  AdministrativeClaim,
  AdministrativeEvidence,
  isReviewQueue,
  ReviewAssignment,
  ReviewDecision,
  ReviewHistory,
  ReviewInput,
  ReviewQueue,
  ReviewQueueItem,
} from '../../core/administration/administration.models';
import { EVIDENCE_MIMES } from '../../core/claims/claim-evidence.models';
import { CLAIM_UUID, isClaimRecord, isTimestamp } from '../../core/claims/claim.models';
import { ClaimState, isClaimState } from '../../core/claims/claim-status.models';

@Injectable()
export class HttpAdministrationGateway implements AdministrationGateway {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1/administracion`;

  queue(queue: ReviewQueue): Observable<ReviewQueueItem[]> {
    return defer(() => {
      if (!isReviewQueue(queue)) invalid();
      return this.http.get<unknown>(`${this.base}/colas-revision/${queue}/asignaciones`);
    }).pipe(
      map((response) => {
        const value = record(response);
        if (value['tipo'] !== 'cola' || value['destino'] !== queue) invalid();
        const items = array(value['asignaciones']).map((item) => {
          const entry = record(item);
          const result = assignment(entry);
          if (result.tipo !== 'cola' || result.destino !== queue) invalid();
          return { ...result, estadoSiniestro: state(entry['estadoSiniestro']) };
        });
        if (new Set(items.map((item) => item.id.toLowerCase())).size !== items.length) invalid();
        return items;
      }),
    );
  }

  claim(id: string): Observable<AdministrativeClaim> {
    return this.http.get<unknown>(this.claimUrl(id)).pipe(
      map((response) => {
        const value = record(response);
        const claim = value['siniestro'];
        if (!isClaimRecord(claim) || !sameId(claim.id, id)) invalid();
        const evidencias = array(value['evidencias']).map((entry) => evidence(entry, id));
        if (new Set(evidencias.map((item) => item.id)).size !== evidencias.length) invalid();
        return { siniestro: claim, evidencias };
      }),
    );
  }

  history(id: string): Observable<ReviewHistory> {
    return this.http.get<unknown>(`${this.claimUrl(id)}/decisiones`).pipe(
      map((response) => {
        const value = record(response);
        if (!sameId(uuid(value['siniestroId']), id)) invalid();
        const active =
          value['asignacionActiva'] === null ? null : assignment(value['asignacionActiva'], id);
        if (active && active.estado !== 'activa') invalid();
        return {
          siniestroId: id,
          estado: state(value['estado']),
          asignacionActiva: active,
          decisiones: array(value['decisiones']).map((entry) => decision(entry, id)),
        };
      }),
    );
  }

  decide(id: string, input: ReviewInput, key: string): Observable<ReviewDecision> {
    return defer(() => {
      uuid(key);
      if (
        !['aprobado', 'rechazado', 'inspeccion'].includes(input.resultado) ||
        input.motivo !== input.motivo.trim() ||
        input.motivo.length < 10 ||
        input.motivo.length > 1000
      )
        invalid();
      return this.http.post<unknown>(
        `${this.claimUrl(id)}/decisiones/revision`,
        { resultado: input.resultado, motivo: input.motivo },
        { headers: { 'Idempotency-Key': key }, observe: 'response' },
      );
    }).pipe(
      map((response) => {
        if (response.status !== 200 && response.status !== 201) invalid();
        const result = decision(response.body, id);
        if (
          !sameId(result.operacionId, key) ||
          result.origen !== 'humana' ||
          result.resultado !== input.resultado ||
          result.motivo !== input.motivo
        )
          invalid();
        return result;
      }),
    );
  }

  content(id: string, item: AdministrativeEvidence): Observable<Blob> {
    return this.http
      .get(`${this.claimUrl(id)}/evidencias/${uuid(item.id)}/contenido`, { responseType: 'blob' })
      .pipe(
        map((blob) => {
          if (
            !sameId(item.siniestroId, id) ||
            blob.size !== item.tamanoBytes ||
            blob.type !== item.mimeType
          )
            invalid();
          return blob;
        }),
      );
  }

  private claimUrl(id: string): string {
    return `${this.base}/siniestros/${uuid(id)}`;
  }
}

function invalid(): never {
  throw new Error('Invalid administrative review contract.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function uuid(value: unknown): string {
  return typeof value === 'string' && CLAIM_UUID.test(value) ? value : invalid();
}

function date(value: unknown): string {
  return isTimestamp(value) ? value : invalid();
}

function state(value: unknown): ClaimState {
  return isClaimState(value) ? value : invalid();
}

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assignment(value: unknown, claimId?: string): ReviewAssignment {
  const entry = record(value);
  const tipo = entry['tipo'];
  const estado = entry['estado'];
  if ((tipo !== 'cola' && tipo !== 'perito') || (estado !== 'activa' && estado !== 'cerrada')) {
    invalid();
  }
  const siniestroId = uuid(entry['siniestroId']);
  const cerradaEn = entry['cerradaEn'] === null ? null : date(entry['cerradaEn']);
  if (
    (claimId && !sameId(siniestroId, claimId)) ||
    (estado === 'activa') !== (cerradaEn === null)
  ) {
    invalid();
  }
  return {
    id: uuid(entry['id']),
    siniestroId,
    tipo,
    destino: text(entry['destino']),
    estado,
    asignadaEn: date(entry['asignadaEn']),
    cerradaEn,
  };
}

function decision(value: unknown, claimId: string): ReviewDecision {
  const entry = record(value);
  const actor = record(entry['actor']);
  const origen = entry['origen'];
  const tipo = actor['tipo'];
  const resultado = entry['resultado'];
  if (
    !sameId(uuid(entry['siniestroId']), claimId) ||
    (origen !== 'automatica' && origen !== 'humana') ||
    (tipo !== 'sistema' && tipo !== 'revisor') ||
    (resultado !== 'aprobado' &&
      resultado !== 'rechazado' &&
      resultado !== 'inspeccion' &&
      resultado !== 'revision' &&
      resultado !== 'bloqueado_fraude')
  )
    invalid();
  return {
    id: uuid(entry['id']),
    siniestroId: claimId,
    operacionId: uuid(entry['operacionId']),
    origen,
    actor: { tipo, id: actor['id'] === null ? null : uuid(actor['id']) },
    resultado,
    estadoAnterior: state(entry['estadoAnterior']),
    estadoNuevo: state(entry['estadoNuevo']),
    motivo: typeof entry['motivo'] === 'string' ? entry['motivo'] : invalid(),
    decididaEn: date(entry['decididaEn']),
    asignacion: entry['asignacion'] === null ? null : assignment(entry['asignacion'], claimId),
  };
}

function evidence(value: unknown, claimId: string): AdministrativeEvidence {
  const entry = record(value);
  const mimeType = EVIDENCE_MIMES.find((mime) => mime === entry['mimeType']) ?? invalid();
  const tamanoBytes = entry['tamanoBytes'];
  const sha256 = entry['sha256'];
  if (
    !sameId(uuid(entry['siniestroId']), claimId) ||
    typeof tamanoBytes !== 'number' ||
    !Number.isSafeInteger(tamanoBytes) ||
    tamanoBytes <= 0 ||
    typeof sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(sha256)
  )
    invalid();
  const location = entry['ubicacion'] === null ? null : record(entry['ubicacion']);
  const ubicacion =
    location === null
      ? null
      : {
          consentimiento: location['consentimiento'],
          latitud: location['latitud'],
          longitud: location['longitud'],
          fecha: location['fecha'],
        };
  if (
    ubicacion &&
    (typeof ubicacion.consentimiento !== 'boolean' ||
      typeof ubicacion.latitud !== 'number' ||
      !Number.isFinite(ubicacion.latitud) ||
      Math.abs(ubicacion.latitud) > 90 ||
      typeof ubicacion.longitud !== 'number' ||
      !Number.isFinite(ubicacion.longitud) ||
      Math.abs(ubicacion.longitud) > 180 ||
      !isTimestamp(ubicacion.fecha))
  )
    invalid();
  return {
    id: uuid(entry['id']),
    siniestroId: claimId,
    mimeType,
    tamanoBytes,
    sha256,
    autorId: uuid(entry['autorId']),
    creadaEn: date(entry['creadaEn']),
    fechaCaptura: entry['fechaCaptura'] === null ? null : date(entry['fechaCaptura']),
    ubicacion:
      ubicacion === null
        ? null
        : {
            consentimiento:
              typeof ubicacion.consentimiento === 'boolean' ? ubicacion.consentimiento : invalid(),
            latitud: typeof ubicacion.latitud === 'number' ? ubicacion.latitud : invalid(),
            longitud: typeof ubicacion.longitud === 'number' ? ubicacion.longitud : invalid(),
            fecha: date(ubicacion.fecha),
          },
  };
}

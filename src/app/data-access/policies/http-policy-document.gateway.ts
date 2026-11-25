import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DOCUMENT_HASH,
  DOCUMENT_UUID,
  DocumentAcceptance,
  DocumentAcceptanceAttempt,
  DocumentMetadata,
  PolicyDocument,
  PolicyDocumentError,
  sameDocument,
} from '../../core/policies/policy-document.models';

@Injectable({ providedIn: 'root' })
export class HttpPolicyDocumentGateway {
  private readonly http = inject(HttpClient);

  load(policyId: string, actorId: string): Observable<PolicyDocument> {
    return this.http.get<unknown>(`${base(policyId)}/documento`).pipe(
      timeout(20_000),
      map((value) => documentResponse(value, policyId, actorId)),
      catchError((error: unknown) => throwError(() => documentError(error))),
    );
  }

  accept(
    policyId: string,
    actorId: string,
    attempt: DocumentAcceptanceAttempt,
  ): Observable<DocumentAcceptance> {
    return this.http
      .post<unknown>(`${base(policyId)}/aceptaciones`, attempt.body, {
        headers: new HttpHeaders({ 'Idempotency-Key': attempt.key }),
        observe: 'response',
      })
      .pipe(
        timeout(20_000),
        map((response) => {
          const result = acceptance(response.body, policyId, actorId);
          if (![200, 201].includes(response.status) || !sameDocument(result, attempt.body)) {
            invalid();
          }
          return result;
        }),
        catchError((error: unknown) => throwError(() => documentError(error))),
      );
  }

  download(document: PolicyDocument): Observable<ArrayBuffer> {
    return this.http
      .get(
        `${base(document.polizaId)}/documentos/${encodeURIComponent(document.documentoId)}/descarga/pdf`,
        { observe: 'response', responseType: 'arraybuffer' },
      )
      .pipe(
        timeout(20_000),
        switchMap((response) => from(verifyDownload(response, document.contenidoHash))),
        catchError((error: unknown) => throwError(() => documentError(error))),
      );
  }
}

function base(policyId: string): string {
  if (!DOCUMENT_UUID.test(policyId)) invalid();
  return `${environment.apiBaseUrl}/v1/clientes/me/polizas/${encodeURIComponent(policyId)}`;
}

function invalid(): never {
  throw new PolicyDocumentError('invalid');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function uuid(value: unknown): string {
  const result = text(value);
  return DOCUMENT_UUID.test(result) ? result : invalid();
}

function version(value: unknown): number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1)
    ? value
    : invalid();
}

function day(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) &&
    Number.isFinite(Date.parse(result)) &&
    new Date(result).toISOString().slice(0, 10) === result
    ? result
    : invalid();
}

function instant(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}T.*(?:Z|\+00:00)$/.test(result) && Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}

function list<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(parse) : invalid();
}

function metadata(value: unknown, policyId: string): DocumentMetadata {
  const fields = record(value);
  const result: DocumentMetadata = {
    documentoId: uuid(fields['documentoId']),
    polizaId: uuid(fields['polizaId']),
    versionPoliza: version(fields['versionPoliza']),
    contenidoHash: text(fields['contenidoHash']),
    formato: 'html',
    simulada: true,
    aviso: text(fields['aviso']),
  };
  if (
    result.polizaId !== policyId ||
    !DOCUMENT_HASH.test(result.contenidoHash) ||
    fields['formato'] !== 'html' ||
    fields['simulada'] !== true
  ) {
    invalid();
  }
  return result;
}

function acceptance(value: unknown, policyId: string, actorId: string): DocumentAcceptance {
  const fields = record(value);
  const result = {
    ...metadata(fields, policyId),
    id: uuid(fields['id']),
    actorId: uuid(fields['actorId']),
    aceptadaEn: instant(fields['aceptadaEn']),
  };
  return result.actorId === actorId ? result : invalid();
}

function documentResponse(value: unknown, policyId: string, actorId: string): PolicyDocument {
  const fields = record(value);
  const meta = metadata(fields, policyId);
  const content = record(fields['contenido']);
  const product = record(content['producto']);
  const term = record(content['vigencia']);
  const premium = content['prima'] === null ? null : record(content['prima']);
  const state = content['estado'];
  const plan = content['plan'];
  if (
    content['formatoVersion'] !== 1 ||
    content['simulada'] !== true ||
    content['aviso'] !== meta.aviso ||
    uuid(content['polizaId']) !== policyId ||
    uuid(content['clienteId']) !== actorId ||
    version(content['version']) !== meta.versionPoliza ||
    !['activa', 'cancelada'].includes(String(state)) ||
    (plan !== null && typeof plan !== 'string')
  ) {
    invalid();
  }
  const start = day(term['inicio']);
  const end = day(term['fin']);
  if (end < start) invalid();
  if (
    premium &&
    (!/^\d+$/.test(text(premium['monto'])) ||
      premium['moneda'] !== 'COP' ||
      premium['periodicidad'] !== 'mensual')
  ) {
    invalid();
  }
  const current =
    fields['aceptacionActual'] === null
      ? null
      : acceptance(fields['aceptacionActual'], policyId, actorId);
  if (current && !sameDocument(meta, current)) invalid();
  const history = list(fields['historialAceptaciones'], (entry) =>
    acceptance(entry, policyId, actorId),
  );
  if (new Set(history.map((entry) => entry.id)).size !== history.length) invalid();
  const coverages = list(content['coberturas'], (entry) => {
    const coverage = record(entry);
    if (typeof coverage['opcional'] !== 'boolean' || typeof coverage['incluida'] !== 'boolean') {
      invalid();
    }
    return {
      codigo: text(coverage['codigo']),
      nombre: text(coverage['nombre']),
      descripcion: text(coverage['descripcion']),
      opcional: coverage['opcional'],
      incluida: coverage['incluida'],
    };
  });
  if (!coverages.length) invalid();
  return {
    ...meta,
    contenido: {
      formatoVersion: 1,
      simulada: true,
      aviso: meta.aviso,
      polizaId: policyId,
      clienteId: actorId,
      suscripcionId: uuid(content['suscripcionId']),
      producto: { tipo: text(product['tipo']), nombre: text(product['nombre']) },
      vigencia: { inicio: start, fin: end },
      estado: state as 'activa' | 'cancelada',
      emitidaEn: instant(content['emitidaEn']),
      reglaEmision: text(content['reglaEmision']),
      version: meta.versionPoliza,
      plan: plan === null ? null : text(plan),
      coberturas: coverages,
      prima: premium
        ? { monto: text(premium['monto']), moneda: 'COP', periodicidad: 'mensual' }
        : null,
      condiciones: list(content['condiciones'], text),
    },
    aceptacionActual: current,
    historialAceptaciones: history,
  };
}

async function verifyDownload(
  response: HttpResponse<ArrayBuffer>,
  expectedHash: string,
): Promise<ArrayBuffer> {
  const bytes = response.body;
  const headers = response.headers;
  const contentType = headers.get('Content-Type');
  const advertisedHash = headers.get('X-Content-SHA256');
  const sourceHash = headers.get('X-Document-Content-SHA256');
  const disposition = headers.get('Content-Disposition');
  const nosniff = headers.get('X-Content-Type-Options');
  const cache = headers.get('Cache-Control');
  const csp = headers.get('Content-Security-Policy');
  if (
    response.status !== 200 ||
    !bytes?.byteLength ||
    bytes.byteLength > 1_048_576 ||
    !/^application\/pdf$/i.test(contentType ?? '') ||
    !advertisedHash ||
    !DOCUMENT_HASH.test(advertisedHash) ||
    sourceHash !== expectedHash ||
    (disposition !== null &&
      !/^attachment\s*;.*filename="?[^";/\\]+\.pdf"?(?:;|$)/i.test(disposition)) ||
    (nosniff !== null && nosniff.toLowerCase() !== 'nosniff') ||
    (cache !== null && !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(cache)) ||
    (csp !== null &&
      (!/(?:^|;)\s*default-src\s+'none'\s*(?:;|$)/i.test(csp) ||
        !/(?:^|;)\s*sandbox\s*(?:;|$)/i.test(csp)))
  ) {
    throw new PolicyDocumentError('download');
  }
  // The PDF has its own digest; the canonical DTO hash still identifies its HTML source.
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const prefix = new TextDecoder('ascii').decode(bytes.slice(0, 8));
  const tail = new TextDecoder('ascii').decode(bytes.slice(-1024));
  if (hash !== advertisedHash || !/^%PDF-1\.[0-9]/.test(prefix) || !/%%EOF\s*$/.test(tail)) {
    throw new PolicyDocumentError('download');
  }
  return bytes;
}

function documentError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) return error;
  const payload: unknown = error.error;
  const code =
    payload !== null && typeof payload === 'object'
      ? (payload as Record<string, unknown>)['code']
      : null;
  if (error.status === 401) return new PolicyDocumentError('session');
  if (error.status === 403) return new PolicyDocumentError('forbidden');
  if (error.status === 404) return new PolicyDocumentError('notFound');
  if (error.status === 400) return new PolicyDocumentError('invalidRequest');
  if (error.status === 409 && code === 'documento_desactualizado') {
    return new PolicyDocumentError('outdated');
  }
  if (error.status === 409 && code === 'idempotencia_conflictiva') {
    return new PolicyDocumentError('keyConflict');
  }
  return error;
}

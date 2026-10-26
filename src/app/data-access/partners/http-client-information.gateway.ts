import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DocumentType } from '../../core/auth/auth.models';
import { UUID_PATTERN } from '../quotes/http-partner-quote.gateway';

interface ClientInformationRequestContext {
  operationId: string;
  socioId: string;
  productoId: string;
  finalidad: 'cotizacion';
  datosSolicitados: string[];
}

export type ClientInformationRequest = ClientInformationRequestContext &
  (
    | {
        clienteId: string;
        tipoDocumento?: never;
        numeroDocumento?: never;
      }
    | {
        clienteId?: never;
        tipoDocumento: DocumentType;
        numeroDocumento: string;
      }
  );

export interface ClientInformationResult {
  operationId: string;
  socioId: string;
  clienteId: string;
  productoId: string;
  finalidad: 'cotizacion';
  estado: 'completada';
  consentimientoId: string;
  consentimientoVersion: number;
  datos: Record<string, string>;
  evidenciaFuentes: {
    fuente: 'open_finance' | 'open_data';
    version: string;
    consultadaEn: string;
    simulada: boolean;
  }[];
  consultadaEn: string;
}

@Injectable({ providedIn: 'root' })
export class HttpClientInformationGateway {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/socios/consultas-informacion-cliente`;

  consult(request: ClientInformationRequest): Observable<ClientInformationResult> {
    return this.http
      .post<unknown>(this.url, request, {
        headers: { 'Idempotency-Key': request.operationId, 'API-Version': '1' },
      })
      .pipe(map((body) => parseResult(body, request)));
  }
}

function parseResult(body: unknown, request: ClientInformationRequest): ClientInformationResult {
  if (
    !body ||
    typeof body !== 'object' ||
    !('operationId' in body) ||
    body.operationId !== request.operationId ||
    !('socioId' in body) ||
    body.socioId !== request.socioId ||
    !('clienteId' in body) ||
    typeof body.clienteId !== 'string' ||
    !UUID_PATTERN.test(body.clienteId) ||
    ('clienteId' in request && body.clienteId !== request.clienteId) ||
    !('productoId' in body) ||
    body.productoId !== request.productoId ||
    !('finalidad' in body) ||
    body.finalidad !== 'cotizacion' ||
    !('estado' in body) ||
    body.estado !== 'completada' ||
    !('consentimientoId' in body) ||
    typeof body.consentimientoId !== 'string' ||
    !UUID_PATTERN.test(body.consentimientoId) ||
    !('consentimientoVersion' in body) ||
    !Number.isInteger(body.consentimientoVersion) ||
    !('datos' in body) ||
    !isStringRecord(body.datos) ||
    !('evidenciaFuentes' in body) ||
    !isEvidence(body.evidenciaFuentes) ||
    !('consultadaEn' in body) ||
    typeof body.consultadaEn !== 'string' ||
    !Number.isFinite(Date.parse(body.consultadaEn))
  ) {
    throw new Error('Invalid client information response.');
  }
  return body as ClientInformationResult;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

function isEvidence(value: unknown): value is ClientInformationResult['evidenciaFuentes'] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        !!item &&
        typeof item === 'object' &&
        'fuente' in item &&
        (item.fuente === 'open_finance' || item.fuente === 'open_data') &&
        'version' in item &&
        typeof item.version === 'string' &&
        'consultadaEn' in item &&
        typeof item.consultadaEn === 'string' &&
        Number.isFinite(Date.parse(item.consultadaEn)) &&
        'simulada' in item &&
        typeof item.simulada === 'boolean',
    )
  );
}

export function clientInformationErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    const code =
      body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
        ? body.code
        : null;
    if (code === 'consentimiento_invalido') return 'clientInformation.errors.consent';
    if (code === 'idempotencia_conflicto') return 'clientInformation.errors.conflict';
    if (code === 'producto_no_autorizado' || code === 'finalidad_no_autorizada') {
      return 'clientInformation.errors.forbidden';
    }
    if (error.status === 404) return 'clientInformation.errors.client';
    if (error.status === 401 || error.status === 403) {
      return 'clientInformation.errors.forbidden';
    }
  }
  return 'clientInformation.errors.unavailable';
}

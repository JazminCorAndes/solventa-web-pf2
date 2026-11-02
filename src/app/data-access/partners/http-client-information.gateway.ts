import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DocumentType } from '../../core/auth/auth.models';
import { UUID_PATTERN } from '../quotes/http-partner-quote.gateway';
import {
  AdvisorExceptionStatus,
  ExceptionApplication,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import {
  applicationMatchesDecision,
  isExceptionApplication,
} from '../advisor-exceptions/exception-application';

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

export interface ClientInformationReview {
  operationId: string;
  socioId: string;
  clienteId: string;
  productoId: string;
  excepcionId: string;
  estadoDecision: AdvisorExceptionStatus;
  aplicacion: ExceptionApplication;
}

export class ClientInformationReviewRequired extends Error {
  constructor(readonly review: ClientInformationReview) {
    super('Client information requires exception review.');
    this.name = 'ClientInformationReviewRequired';
  }
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
      .pipe(
        map((body) => parseResult(body, request)),
        catchError((error: unknown) => {
          if (
            isProblem(error, 503, 'consulta_bloqueada') ||
            isProblem(error, 409, 'operacion_rechazada')
          ) {
            const review = parseReview(error.error['operacion'], request);
            if (error.status === 409 && review.estadoDecision !== 'rechazada') {
              return throwError(() => new Error('Invalid client information review.'));
            }
            return throwError(() => new ClientInformationReviewRequired(review));
          }
          return throwError(() => error);
        }),
      );
  }

  loadStatus(operationId: string, socioId: string): Observable<ClientInformationReview> {
    return this.http
      .get<unknown>(`${this.url}/${encodeURIComponent(operationId)}/estado`, {
        params: { socioId },
        headers: { 'API-Version': '1' },
      })
      .pipe(map((body) => parseReview(body, { operationId, socioId })));
  }

  load(operationId: string, socioId: string): Observable<ClientInformationResult> {
    return this.http
      .get<unknown>(`${this.url}/${encodeURIComponent(operationId)}`, {
        params: { socioId },
        headers: { 'API-Version': '1' },
      })
      .pipe(
        map((body) =>
          parseResult(body, {
            operationId,
            socioId,
            clienteId:
              body &&
              typeof body === 'object' &&
              'clienteId' in body &&
              typeof body.clienteId === 'string'
                ? body.clienteId
                : '',
            productoId:
              body &&
              typeof body === 'object' &&
              'productoId' in body &&
              typeof body.productoId === 'string'
                ? body.productoId
                : '',
            finalidad: 'cotizacion',
            datosSolicitados: ['indicador_riesgo'],
          }),
        ),
      );
  }
}

function parseReview(
  body: unknown,
  expected: { operationId: string; socioId: string; productoId?: string; clienteId?: string },
): ClientInformationReview {
  if (
    !isReview(body) ||
    body.operationId !== expected.operationId ||
    body.socioId !== expected.socioId ||
    (expected.productoId !== undefined && body.productoId !== expected.productoId) ||
    (expected.clienteId !== undefined && body.clienteId !== expected.clienteId)
  ) {
    throw new Error('Invalid client information review.');
  }
  return body;
}

function isReview(body: unknown): body is ClientInformationReview {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const allowed = [
    'operationId',
    'socioId',
    'clienteId',
    'productoId',
    'excepcionId',
    'estadoDecision',
    'aplicacion',
  ];
  return (
    Object.keys(body).every((key) => allowed.includes(key)) &&
    'operationId' in body &&
    typeof body.operationId === 'string' &&
    UUID_PATTERN.test(body.operationId) &&
    'socioId' in body &&
    typeof body.socioId === 'string' &&
    body.socioId.trim().length > 0 &&
    'clienteId' in body &&
    typeof body.clienteId === 'string' &&
    UUID_PATTERN.test(body.clienteId) &&
    'productoId' in body &&
    typeof body.productoId === 'string' &&
    body.productoId.trim().length > 0 &&
    'excepcionId' in body &&
    typeof body.excepcionId === 'string' &&
    UUID_PATTERN.test(body.excepcionId) &&
    'estadoDecision' in body &&
    (body.estadoDecision === 'pendiente' ||
      body.estadoDecision === 'aprobada' ||
      body.estadoDecision === 'rechazada') &&
    'aplicacion' in body &&
    isExceptionApplication(body.aplicacion) &&
    applicationMatchesDecision(body.aplicacion, body.estadoDecision)
  );
}

function isProblem(
  error: unknown,
  status: number,
  code: string,
): error is HttpErrorResponse & { error: Record<string, unknown> } {
  if (!(error instanceof HttpErrorResponse) || error.status !== status) return false;
  const body: unknown = error.error;
  return (
    !!body &&
    typeof body === 'object' &&
    'status' in body &&
    body.status === status &&
    'code' in body &&
    body.code === code &&
    'type' in body &&
    body.type === `https://api.solventa.co/problems/${code}` &&
    'title' in body &&
    typeof body.title === 'string' &&
    'detail' in body &&
    typeof body.detail === 'string' &&
    'correlationId' in body &&
    typeof body.correlationId === 'string' &&
    UUID_PATTERN.test(body.correlationId) &&
    error.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ===
      'application/problem+json'
  );
}

export function clientInformationStatusMissing(error: unknown): boolean {
  return isProblem(error, 404, 'consulta_no_encontrada');
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

export function clientInformationErrorKey(error: unknown, recoveringOperation = false): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    const code =
      body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
        ? body.code
        : null;
    if (code === 'consentimiento_invalido') return 'clientInformation.errors.consent';
    if (code === 'consulta_no_encontrada') return 'clientInformation.errors.operation';
    if (code === 'idempotencia_conflicto') return 'clientInformation.errors.conflict';
    if (code === 'producto_no_autorizado' || code === 'finalidad_no_autorizada') {
      return 'clientInformation.errors.forbidden';
    }
    if (error.status === 404)
      return recoveringOperation
        ? 'clientInformation.errors.operation'
        : 'clientInformation.errors.client';
    if (error.status === 401 || error.status === 403) {
      return 'clientInformation.errors.forbidden';
    }
  }
  return 'clientInformation.errors.unavailable';
}

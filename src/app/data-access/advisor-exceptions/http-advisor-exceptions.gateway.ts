import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdvisorException,
  AdvisorExceptionDecision,
  AdvisorExceptionError,
  AdvisorExceptionErrorCode,
  AdvisorExceptionReason,
  AdvisorExceptionStatus,
  ConsentStatus,
  ResolvedAdvisorException,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { AdvisorExceptionsGateway } from '../../core/advisor-exceptions/advisor-exceptions.gateway';

const BASE_URL = `${environment.apiBaseUrl}/v1/asesor/excepciones-open-finance`;
const REASONS = new Set<AdvisorExceptionReason>([
  'fuente_no_disponible',
  'fuente_vencida',
  'regla_no_aplicable',
]);
const STATUSES = new Set<AdvisorExceptionStatus>(['pendiente', 'aprobada', 'rechazada']);
const CONSENT_STATUSES = new Set<ConsentStatus>(['autorizado', 'rechazado', 'revocado', 'vencido']);

@Injectable()
export class HttpAdvisorExceptionsGateway implements AdvisorExceptionsGateway {
  private readonly http = inject(HttpClient);

  list(socioId: string): Observable<AdvisorException[]> {
    return this.http
      .get<unknown>(BASE_URL, { params: new HttpParams().set('socioId', socioId) })
      .pipe(
        map((body) => {
          if (!isRecord(body) || !Array.isArray(body['excepciones'])) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          const exceptions = body['excepciones'].map((item) => parseException(item));
          if (exceptions.some((item) => item.estado !== 'pendiente' || item.socioId !== socioId)) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          return exceptions;
        }),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }

  get(excepcionId: string, socioId: string): Observable<AdvisorException> {
    return this.http
      .get<unknown>(`${BASE_URL}/${encodeURIComponent(excepcionId)}`, {
        params: new HttpParams().set('socioId', socioId),
      })
      .pipe(
        map((body) => {
          const exception = parseException(body);
          if (exception.excepcionId !== excepcionId || exception.socioId !== socioId) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          return exception;
        }),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }

  resolve(
    excepcionId: string,
    socioId: string,
    decision: AdvisorExceptionDecision,
    motivo: string,
  ): Observable<ResolvedAdvisorException> {
    return this.http
      .post<unknown>(
        `${BASE_URL}/${encodeURIComponent(excepcionId)}/resolver`,
        { decision, motivo },
        { params: new HttpParams().set('socioId', socioId), observe: 'response' },
      )
      .pipe(
        map((response) => {
          if (response.status !== 200 || response.body === null) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          const body = response.body;
          const exception = parseException(body);
          const finalStatus: 'aprobada' | 'rechazada' =
            decision === 'aprobar' ? 'aprobada' : 'rechazada';
          if (
            exception.excepcionId !== excepcionId ||
            exception.socioId !== socioId ||
            exception.estado !== finalStatus ||
            !isRecord(body) ||
            body['decision'] !== decision ||
            !isNonEmptyString(body['actorId']) ||
            !isIsoDate(body['resueltaEn']) ||
            body['motivo'] !== motivo
          ) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          return {
            ...exception,
            estado: finalStatus,
            decision,
            actorId: body['actorId'],
            resueltaEn: body['resueltaEn'],
            motivo,
          };
        }),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }
}

function parseException(value: unknown): AdvisorException {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['excepcionId']) ||
    !isNonEmptyString(value['operationId']) ||
    !isNonEmptyString(value['socioId']) ||
    !isNonEmptyString(value['clienteId']) ||
    typeof value['codigo'] !== 'string' ||
    !REASONS.has(value['codigo'] as AdvisorExceptionReason) ||
    !isNonEmptyString(value['motivoBloqueo']) ||
    value['alcance'] !== 'open_finance' ||
    value['finalidad'] !== 'cotizacion' ||
    !isRiskIndicatorData(value['datos']) ||
    !isRecord(value['consentimiento']) ||
    !isNonEmptyString(value['consentimiento']['id']) ||
    !isConsentVersion(value['consentimiento']['version']) ||
    typeof value['consentimiento']['estado'] !== 'string' ||
    !CONSENT_STATUSES.has(value['consentimiento']['estado'] as ConsentStatus) ||
    !isStringArray(value['consentimiento']['fuentes']) ||
    !isStringArray(value['consentimiento']['datos']) ||
    value['consentimiento']['finalidad'] !== 'cotizacion' ||
    !isIsoDate(value['consentimiento']['vigenteHasta']) ||
    typeof value['estado'] !== 'string' ||
    !STATUSES.has(value['estado'] as AdvisorExceptionStatus) ||
    !isNullableNonEmptyString(value['estadoAnterior']) ||
    !isIsoDate(value['creadoEn']) ||
    !isNonEmptyString(value['correlationId']) ||
    !isRecord(value['trazabilidad']) ||
    !isNullableNonEmptyString(value['trazabilidad']['estadoAnterior']) ||
    value['trazabilidad']['estadoAnterior'] !== value['estadoAnterior'] ||
    value['trazabilidad']['estadoActual'] !== value['estado'] ||
    value['trazabilidad']['alcance'] !== 'open_finance' ||
    value['trazabilidad']['creadoEn'] !== value['creadoEn'] ||
    value['trazabilidad']['correlationId'] !== value['correlationId']
  ) {
    throw new AdvisorExceptionError('respuesta_invalida');
  }
  return value as unknown as AdvisorException;
}

function mapError(error: unknown): unknown {
  if (error instanceof AdvisorExceptionError) return error;
  if (!(error instanceof HttpErrorResponse)) return error;

  const body = isRecord(error.error) ? error.error : null;
  const code = body && typeof body['code'] === 'string' ? body['code'] : null;
  const backendCodes: Partial<Record<string, AdvisorExceptionErrorCode>> = {
    sesion_invalida: 'sesion_invalida',
    socio_no_autorizado: 'socio_no_autorizado',
    alcance_insuficiente: 'alcance_insuficiente',
    excepcion_no_encontrada: 'excepcion_no_encontrada',
    excepcion_ya_resuelta: 'excepcion_ya_resuelta',
    solicitud_invalida: 'solicitud_invalida',
    servicio_no_disponible: 'servicio_no_disponible',
    consentimiento_ausente: 'consentimiento_ausente',
    consentimiento_no_vigente: 'consentimiento_no_vigente',
  };
  if (code && backendCodes[code]) return new AdvisorExceptionError(backendCodes[code]);
  if (error.status === 401) return new AdvisorExceptionError('sesion_invalida');
  if (error.status === 403) return new AdvisorExceptionError('alcance_insuficiente');
  if (error.status === 404) return new AdvisorExceptionError('excepcion_no_encontrada');
  if (error.status === 409) return new AdvisorExceptionError('excepcion_ya_resuelta');
  if (error.status === 400) return new AdvisorExceptionError('solicitud_invalida');
  return new AdvisorExceptionError('servicio_no_disponible');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRiskIndicatorData(value: unknown): value is ['indicador_riesgo'] {
  return Array.isArray(value) && value.length === 1 && value[0] === 'indicador_riesgo';
}

function isConsentVersion(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && Number.isFinite(value) && value > 0)
  );
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

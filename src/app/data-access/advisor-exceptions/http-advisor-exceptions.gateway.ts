import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdvisorException,
  AdvisorExceptionDecision,
  AdvisorExceptionError,
  AdvisorExceptionErrorCode,
  ExceptionApplicationFilter,
  ResolvedAdvisorException,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { AdvisorExceptionsGateway } from '../../core/advisor-exceptions/advisor-exceptions.gateway';
import {
  applicationMatchesDecision,
  isApplicationFilter,
  isExceptionApplication,
  isIsoDate,
  sameInstant,
} from './exception-application';
import { UUID_PATTERN } from '../quotes/http-partner-quote.gateway';

const BASE_URL = `${environment.apiBaseUrl}/v1/asesor/excepciones-open-finance`;
const REASONS = new Set<string>(['fuente_no_disponible', 'fuente_vencida', 'regla_no_aplicable']);
const CONSENT_STATUSES = new Set<string>(['autorizado', 'rechazado', 'revocado', 'vencido']);

@Injectable()
export class HttpAdvisorExceptionsGateway implements AdvisorExceptionsGateway {
  private readonly http = inject(HttpClient);

  list(
    socioId: string,
    estadoAplicacion?: ExceptionApplicationFilter,
  ): Observable<AdvisorException[]> {
    let params = new HttpParams().set('socioId', socioId);
    if (estadoAplicacion !== undefined) {
      if (!isApplicationFilter(estadoAplicacion)) {
        return throwError(() => new AdvisorExceptionError('solicitud_invalida'));
      }
      params = params.set('estadoAplicacion', estadoAplicacion);
    }
    return this.http.get<unknown>(BASE_URL, { params }).pipe(
      map((body) => {
        if (!isRecord(body) || !Array.isArray(body['excepciones'])) {
          throw new AdvisorExceptionError('respuesta_invalida');
        }
        const exceptions = body['excepciones'].map((rawException) => parseException(rawException));
        if (
          exceptions.some(
            (exception) =>
              exception.socioId !== socioId ||
              (estadoAplicacion === undefined
                ? exception.estado !== 'pendiente'
                : exception.aplicacion?.estado !== estadoAplicacion),
          )
        ) {
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
          const exception = parseException(response.body);
          const finalStatus: 'aprobada' | 'rechazada' =
            decision === 'aprobar' ? 'aprobada' : 'rechazada';
          if (
            exception.excepcionId !== excepcionId ||
            exception.socioId !== socioId ||
            exception.estado === 'pendiente' ||
            exception.estado !== finalStatus ||
            exception.decision !== decision ||
            exception.motivo !== motivo
          ) {
            throw new AdvisorExceptionError('respuesta_invalida');
          }
          return exception;
        }),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }

  apply(excepcionId: string, socioId: string): Observable<ResolvedAdvisorException> {
    return this.http
      .post<unknown>(
        `${BASE_URL}/${encodeURIComponent(excepcionId)}/aplicar`,
        {},
        { params: new HttpParams().set('socioId', socioId), observe: 'response' },
      )
      .pipe(
        map((response) => {
          if (response.status !== 200) throw new AdvisorExceptionError('respuesta_invalida');
          const exception = parseException(response.body);
          if (
            exception.excepcionId !== excepcionId ||
            exception.socioId !== socioId ||
            exception.estado === 'pendiente' ||
            exception.proceso === null ||
            exception.aplicacion === null
          )
            throw new AdvisorExceptionError('respuesta_invalida');
          return exception;
        }),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }
}

function parseException(value: unknown): AdvisorException {
  if (!isException(value)) throw new AdvisorExceptionError('respuesta_invalida');
  return value;
}

function isException(value: unknown): value is AdvisorException {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['excepcionId']) ||
    !isNonEmptyString(value['operationId']) ||
    !isNonEmptyString(value['socioId']) ||
    !isNonEmptyString(value['clienteId']) ||
    typeof value['codigo'] !== 'string' ||
    !REASONS.has(value['codigo']) ||
    !isNonEmptyString(value['motivoBloqueo']) ||
    value['alcance'] !== 'open_finance' ||
    value['finalidad'] !== 'cotizacion' ||
    !isRiskIndicatorData(value['datos']) ||
    !isRecord(value['consentimiento']) ||
    !isNonEmptyString(value['consentimiento']['id']) ||
    !isConsentVersion(value['consentimiento']['version']) ||
    typeof value['consentimiento']['estado'] !== 'string' ||
    !CONSENT_STATUSES.has(value['consentimiento']['estado']) ||
    !isStringArray(value['consentimiento']['fuentes']) ||
    !isStringArray(value['consentimiento']['datos']) ||
    value['consentimiento']['finalidad'] !== 'cotizacion' ||
    !isIsoDate(value['consentimiento']['vigenteHasta']) ||
    (value['estado'] !== 'pendiente' &&
      value['estado'] !== 'aprobada' &&
      value['estado'] !== 'rechazada') ||
    !isNullableNonEmptyString(value['estadoAnterior']) ||
    !isIsoDate(value['creadoEn']) ||
    !isNonEmptyString(value['correlationId']) ||
    !isRecord(value['trazabilidad']) ||
    !isNullableNonEmptyString(value['trazabilidad']['estadoAnterior']) ||
    value['trazabilidad']['estadoAnterior'] !== value['estadoAnterior'] ||
    value['trazabilidad']['estadoActual'] !== value['estado'] ||
    value['trazabilidad']['alcance'] !== 'open_finance' ||
    !sameInstant(value['creadoEn'], value['trazabilidad']['creadoEn']) ||
    value['trazabilidad']['correlationId'] !== value['correlationId']
  ) {
    return false;
  }
  if (value['proceso'] === null) {
    if (value['aplicacion'] !== null) return false;
  } else {
    const process = value['proceso'];
    if (
      !isRecord(process) ||
      Object.keys(process).some(
        (key) =>
          !['tipo', 'actorSolicitanteId', 'productoId', 'finalidad', 'datosSolicitados'].includes(
            key,
          ),
      ) ||
      process['tipo'] !== 'consulta_informacion_cliente' ||
      typeof process['actorSolicitanteId'] !== 'string' ||
      !UUID_PATTERN.test(process['actorSolicitanteId']) ||
      !isNonEmptyString(process['productoId']) ||
      process['finalidad'] !== 'cotizacion' ||
      !isStringArray(process['datosSolicitados']) ||
      !isExceptionApplication(value['aplicacion']) ||
      !applicationMatchesDecision(value['aplicacion'], value['estado'])
    )
      return false;
  }
  return value['estado'] === 'pendiente'
    ? value['decision'] === null &&
        value['actorId'] === null &&
        value['resueltaEn'] === null &&
        value['motivo'] === null
    : value['decision'] === (value['estado'] === 'aprobada' ? 'aprobar' : 'rechazar') &&
        isNonEmptyString(value['actorId']) &&
        isIsoDate(value['resueltaEn']) &&
        isNonEmptyString(value['motivo']);
}

function mapError(error: unknown): unknown {
  if (error instanceof AdvisorExceptionError) return error;
  if (!(error instanceof HttpErrorResponse)) return error;

  const body = isRecord(error.error) ? error.error : null;
  const code = body && typeof body['code'] === 'string' ? body['code'] : null;
  const backendCodes: Partial<Record<string, AdvisorExceptionErrorCode>> = {
    sesion_invalida: 'sesion_invalida',
    socio_no_autorizado: 'socio_no_autorizado',
    actor_no_autorizado: 'actor_no_autorizado',
    alcance_insuficiente: 'alcance_insuficiente',
    excepcion_no_encontrada: 'excepcion_no_encontrada',
    excepcion_ya_resuelta: 'excepcion_ya_resuelta',
    decision_pendiente: 'decision_pendiente',
    excepcion_sin_operacion: 'excepcion_sin_operacion',
    conflicto_idempotencia: 'conflicto_idempotencia',
    version_no_soportada: 'version_no_soportada',
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

import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdvisorProfilingGateway } from '../../core/advisor-profiling/advisor-profiling.gateway';
import {
  MortgageProfilingError,
  MortgageProfilingErrorCode,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
  MORTGAGE_UUID_PATTERN,
} from '../../core/advisor-profiling/advisor-profiling.models';

@Injectable()
export class HttpAdvisorProfilingGateway implements AdvisorProfilingGateway {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`;

  start(request: MortgageProfilingRequest): Observable<MortgageProfilingRecord> {
    return this.http
      .post<unknown>(
        this.url,
        {
          operationId: request.operationId,
          socioId: request.partnerId,
          productoId: 'mortgage-life',
          cliente: {
            clienteId: request.customer.id,
            tipoDocumento: request.customer.documentType,
            numeroDocumento: request.customer.documentNumber,
            telefono: request.customer.phone,
            fechaNacimiento: request.customer.birthDate,
          },
          credito: {
            referencia: request.credit.reference,
            monto: request.credit.amount,
            plazoMeses: request.credit.termMonths,
          },
          consentimientoId: request.consent.id,
          consentimientoVersion: request.consent.version,
        },
        {
          headers: new HttpHeaders({
            'Idempotency-Key': request.operationId,
            'API-Version': '1',
          }),
        },
      )
      .pipe(
        map((response) => parseResult(response, request)),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }
}

function parseResult(body: unknown, request: MortgageProfilingRequest): MortgageProfilingRecord {
  if (
    !body ||
    typeof body !== 'object' ||
    !('operationId' in body) ||
    typeof body.operationId !== 'string' ||
    !MORTGAGE_UUID_PATTERN.test(body.operationId) ||
    body.operationId !== request.operationId ||
    !('socioId' in body) ||
    body.socioId !== request.partnerId ||
    !('clienteId' in body) ||
    typeof body.clienteId !== 'string' ||
    !MORTGAGE_UUID_PATTERN.test(body.clienteId) ||
    body.clienteId !== request.customer.id ||
    !('productoId' in body) ||
    body.productoId !== 'mortgage-life' ||
    !('estado' in body) ||
    body.estado !== 'completada' ||
    !('perfilamientoReferencia' in body) ||
    typeof body.perfilamientoReferencia !== 'string' ||
    !body.perfilamientoReferencia.trim() ||
    !('solicitudId' in body) ||
    typeof body.solicitudId !== 'string' ||
    !body.solicitudId.trim() ||
    !('cotizacionId' in body) ||
    typeof body.cotizacionId !== 'string' ||
    !MORTGAGE_UUID_PATTERN.test(body.cotizacionId) ||
    !('recibidaEn' in body) ||
    typeof body.recibidaEn !== 'string' ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.recibidaEn) ||
    !Number.isFinite(Date.parse(body.recibidaEn))
  ) {
    throw new MortgageProfilingError('invalid_response');
  }
  return {
    operationId: request.operationId,
    partnerId: request.partnerId,
    customerId: request.customer.id,
    productId: body.productoId,
    profilingReference: body.perfilamientoReferencia,
    quoteRequestId: body.solicitudId,
    quoteId: body.cotizacionId,
    status: 'completed',
    receivedAt: body.recibidaEn,
  };
}

function mapError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const backendCode =
    typeof error.error === 'object' &&
    error.error !== null &&
    'code' in error.error &&
    typeof error.error.code === 'string'
      ? error.error.code
      : null;
  const knownCodes: Partial<Record<string, MortgageProfilingErrorCode>> = {
    datos_incompletos: 'incomplete_data',
    consentimiento_invalido: 'invalid_consent',
    socio_no_autorizado: 'unauthorized_partner',
    idempotencia_conflicto: 'idempotency_conflict',
    servicio_no_disponible: 'service_unavailable',
    perfilamiento_no_disponible: 'service_unavailable',
    cliente_no_encontrado: 'customer_not_found',
    perfilamiento_fallido: 'profiling_failed',
    operacion_en_curso: 'operation_in_progress',
    operacion_reintentable: 'operation_retryable',
    cuota_socio_excedida: 'rate_limited',
    socio_ocupado: 'rate_limited',
  };
  if (error.status === 401) {
    return new MortgageProfilingError('session_expired');
  }
  if (backendCode && knownCodes[backendCode]) {
    return new MortgageProfilingError(knownCodes[backendCode]);
  }
  if (error.status === 400 || error.status === 422) {
    return new MortgageProfilingError('incomplete_data');
  }
  if (error.status === 403) {
    return new MortgageProfilingError('unauthorized_partner');
  }
  if (error.status === 429) {
    return new MortgageProfilingError('rate_limited');
  }
  if (error.status === 0 || error.status >= 500) {
    return new MortgageProfilingError('service_unavailable');
  }
  return new MortgageProfilingError('unexpected');
}

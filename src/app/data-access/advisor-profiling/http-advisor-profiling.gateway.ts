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
} from '../../core/advisor-profiling/advisor-profiling.models';

interface MortgageProfilingResponse {
  operationId: string;
  perfilamientoReferencia: string;
  estado: 'procesando';
  recibidaEn: string;
}

@Injectable()
export class HttpAdvisorProfilingGateway implements AdvisorProfilingGateway {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/perfilamientos-hipotecarios`;

  start(request: MortgageProfilingRequest): Observable<MortgageProfilingRecord> {
    return this.http
      .post<MortgageProfilingResponse>(
        this.url,
        {
          operationId: request.operationId,
          socioId: request.partnerId,
          cliente: {
            tipoDocumento: request.customer.documentType,
            numeroDocumento: request.customer.documentNumber,
            nombreCompleto: request.customer.fullName,
            correo: request.customer.email,
            telefono: request.customer.phone,
          },
          credito: {
            referencia: request.credit.reference,
            monto: request.credit.amount,
            plazoMeses: request.credit.termMonths,
          },
          consentimientoReferencia: request.consentReference,
        },
        {
          headers: new HttpHeaders({ 'Idempotency-Key': request.operationId }),
        },
      )
      .pipe(
        map((response) => ({
          operationId: response.operationId,
          profilingReference: response.perfilamientoReferencia,
          status: 'processing' as const,
          receivedAt: response.recibidaEn,
        })),
        catchError((error: unknown) => throwError(() => mapError(error))),
      );
  }
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
  };
  if (backendCode && knownCodes[backendCode]) {
    return new MortgageProfilingError(knownCodes[backendCode]);
  }
  if (error.status === 400 || error.status === 422) {
    return new MortgageProfilingError('incomplete_data');
  }
  if (error.status === 409) {
    return new MortgageProfilingError('idempotency_conflict');
  }
  if (error.status === 0 || error.status >= 500) {
    return new MortgageProfilingError('service_unavailable');
  }
  return new MortgageProfilingError('unexpected');
}

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DocumentType, QuoteProductData } from '../../core/quotes/quote-request.models';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PartnerQuoteRequest {
  operationId: string;
  socioId: string;
  productoId: string;
  datosProducto: QuoteProductData;
  cliente: {
    clienteId: string;
    tipoCliente: 'persona_natural';
    tipoDocumento: DocumentType;
    numeroDocumento: string;
    telefono: string;
  };
  consentimientoId: string;
  consentimientoVersion: number;
}

export interface PartnerQuoteResult {
  operationId: string;
  socioId: string;
  clienteId: string;
  productoId: string;
  estado: 'completada';
  perfilamientoReferencia: string;
  solicitudId: string;
  cotizacionId: string;
  recibidaEn: string;
}

export class InvalidPartnerQuoteResponse extends Error {
  constructor() {
    super('Invalid partner quote response.');
  }
}

@Injectable({ providedIn: 'root' })
export class HttpPartnerQuoteGateway {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/v1/socios/solicitudes-cotizacion`;

  submit(request: PartnerQuoteRequest): Observable<PartnerQuoteResult> {
    return this.http
      .post<unknown>(this.url, request, {
        headers: { 'Idempotency-Key': request.operationId, 'API-Version': '1' },
      })
      .pipe(
        map((body) => {
          const result = parseResult(body, request.operationId, request.socioId);
          if (
            result.clienteId !== request.cliente.clienteId ||
            result.productoId !== request.productoId
          ) {
            throw new InvalidPartnerQuoteResponse();
          }
          return result;
        }),
      );
  }

  load(operationId: string, socioId: string): Observable<PartnerQuoteResult> {
    return this.http
      .get<unknown>(`${this.url}/${encodeURIComponent(operationId)}`, {
        params: { socioId },
        headers: { 'API-Version': '1' },
      })
      .pipe(map((body) => parseResult(body, operationId, socioId)));
  }
}

function parseResult(body: unknown, operationId: string, socioId: string): PartnerQuoteResult {
  if (
    !body ||
    typeof body !== 'object' ||
    !('operationId' in body) ||
    body.operationId !== operationId ||
    !('socioId' in body) ||
    body.socioId !== socioId ||
    !('clienteId' in body) ||
    typeof body.clienteId !== 'string' ||
    !UUID_PATTERN.test(body.clienteId) ||
    !('productoId' in body) ||
    typeof body.productoId !== 'string' ||
    !body.productoId ||
    !('estado' in body) ||
    body.estado !== 'completada' ||
    !('perfilamientoReferencia' in body) ||
    typeof body.perfilamientoReferencia !== 'string' ||
    !body.perfilamientoReferencia ||
    !('solicitudId' in body) ||
    typeof body.solicitudId !== 'string' ||
    !body.solicitudId ||
    !('cotizacionId' in body) ||
    typeof body.cotizacionId !== 'string' ||
    !UUID_PATTERN.test(body.cotizacionId) ||
    !('recibidaEn' in body) ||
    typeof body.recibidaEn !== 'string' ||
    !Number.isFinite(Date.parse(body.recibidaEn))
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  return {
    operationId,
    socioId,
    clienteId: body.clienteId,
    productoId: body.productoId,
    estado: body.estado,
    perfilamientoReferencia: body.perfilamientoReferencia,
    solicitudId: body.solicitudId,
    cotizacionId: body.cotizacionId,
    recibidaEn: body.recibidaEn,
  };
}

export function partnerQuoteErrorCode(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
      return body.code;
    }
  }
  return null;
}

export function partnerQuoteErrorKey(error: unknown): string {
  const code = partnerQuoteErrorCode(error);
  if (code?.startsWith('consentimiento_')) return 'partnerQuote.errors.consent';
  if (code === 'operacion_en_curso') return 'partnerQuote.errors.processing';
  if (code === 'operacion_reintentable') return 'partnerQuote.errors.retryable';
  if (code === 'idempotencia_conflicto') return 'partnerQuote.errors.conflict';
  if (code === 'identidad_no_coincide' || code === 'identidad_no_validada') {
    return 'partnerQuote.errors.identity';
  }
  if (error instanceof InvalidPartnerQuoteResponse) return 'partnerQuote.errors.response';
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 400:
      case 422:
        return 'partnerQuote.errors.invalid';
      case 401:
        return 'profiling.errors.session';
      case 403:
        return 'partnerQuote.errors.forbidden';
      case 404:
        return 'partnerQuote.errors.notFound';
      case 409:
        return 'partnerQuote.errors.conflict';
      case 429:
        return 'partnerQuote.errors.quota';
    }
  }
  return 'partnerQuote.errors.unavailable';
}

export function partnerRetryDelay(error: unknown): number {
  if (!(error instanceof HttpErrorResponse)) return 0;
  const value = error.headers.get('Retry-After');
  if (!value) return 0;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

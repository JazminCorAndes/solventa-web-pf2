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
    tipoCliente: 'persona_natural';
    tipoDocumento: DocumentType;
    numeroDocumento: string;
  };
}

export interface PartnerClientLookup {
  nombre: string;
  tipoDocumento: DocumentType;
  numeroDocumentoEnmascarado: string;
  consentimientoEstado: 'vigente' | 'vencido' | 'revocado' | 'rechazado' | 'ausente';
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
  oferta: PartnerRecommendedOffer;
}

export interface PartnerRecommendedOffer {
  id: string;
  version: number;
  nombre: string;
  descripcion: string;
  prima: { monto: string; moneda: string };
  periodicidad: 'mensual' | 'por_viaje' | 'por_vuelo' | 'por_periodo';
  coberturaPrincipal: string;
  deducible: string;
  vigencia: string;
  coberturas: string[];
  condiciones: string[];
  beneficiosAdicionales: string[];
  vigenteHasta: string;
  explicacion: PartnerOfferExplanation;
  trazabilidad: PartnerOfferTraceability;
}

export interface PartnerOfferFactor {
  nombre: string;
  valor: string;
  impacto: string;
}

export interface PartnerOfferExplanation {
  resumen: string;
  factoresDeterminantes: PartnerOfferFactor[];
}

export interface PartnerOfferTraceability {
  esquemaDecision: number;
  hashDecision: string;
  hashContenido: string;
  perfilId: string;
  perfilVersion: number;
  modeloPerfilVersion: string;
  reglaId: string;
  reglaVersion: string;
  fuentes: Array<{
    nombre: 'open_finance' | 'open_data';
    version: string;
  }>;
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
          if (result.productoId !== request.productoId) {
            throw new InvalidPartnerQuoteResponse();
          }
          return result;
        }),
      );
  }

  lookupClient(
    socioId: string,
    tipoDocumento: DocumentType,
    numeroDocumento: string,
  ): Observable<PartnerClientLookup> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/v1/socios/clientes/por-documento`, {
        params: { socioId, tipoDocumento, numeroDocumento },
        headers: { 'API-Version': '1' },
      })
      .pipe(map(parseClientLookup));
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

function parseClientLookup(body: unknown): PartnerClientLookup {
  if (
    !body ||
    typeof body !== 'object' ||
    !('nombre' in body) ||
    typeof body.nombre !== 'string' ||
    !body.nombre ||
    !('tipoDocumento' in body) ||
    !['cc', 'ce', 'passport', 'ppt'].includes(String(body.tipoDocumento)) ||
    !('numeroDocumentoEnmascarado' in body) ||
    typeof body.numeroDocumentoEnmascarado !== 'string' ||
    !body.numeroDocumentoEnmascarado ||
    !('consentimientoEstado' in body) ||
    !['vigente', 'vencido', 'revocado', 'rechazado', 'ausente'].includes(
      String(body.consentimientoEstado),
    )
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  return body as PartnerClientLookup;
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
    !Number.isFinite(Date.parse(body.recibidaEn)) ||
    !('oferta' in body)
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  const oferta = parseOffer(body.oferta);
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
    oferta,
  };
}

function parseOffer(value: unknown): PartnerRecommendedOffer {
  if (!value || typeof value !== 'object') throw new InvalidPartnerQuoteResponse();
  const offer = value as Record<string, unknown>;
  const premium = offer['prima'];
  const explanation = offer['explicacion'];
  const traceability = offer['trazabilidad'];
  if (
    typeof offer['id'] !== 'string' ||
    !UUID_PATTERN.test(offer['id']) ||
    !Number.isInteger(offer['version']) ||
    Number(offer['version']) < 1 ||
    typeof offer['nombre'] !== 'string' ||
    !offer['nombre'] ||
    typeof offer['descripcion'] !== 'string' ||
    !offer['descripcion'] ||
    !premium ||
    typeof premium !== 'object' ||
    typeof (premium as Record<string, unknown>)['monto'] !== 'string' ||
    typeof (premium as Record<string, unknown>)['moneda'] !== 'string' ||
    !['mensual', 'por_viaje', 'por_vuelo', 'por_periodo'].includes(String(offer['periodicidad'])) ||
    typeof offer['coberturaPrincipal'] !== 'string' ||
    typeof offer['deducible'] !== 'string' ||
    typeof offer['vigencia'] !== 'string' ||
    !Array.isArray(offer['coberturas']) ||
    !isNonEmptyStringArray(offer['coberturas']) ||
    !Array.isArray(offer['condiciones']) ||
    !isNonEmptyStringArray(offer['condiciones']) ||
    !Array.isArray(offer['beneficiosAdicionales']) ||
    !offer['beneficiosAdicionales'].every(isNonEmptyString) ||
    typeof offer['vigenteHasta'] !== 'string' ||
    !Number.isFinite(Date.parse(offer['vigenteHasta'])) ||
    !isExplanation(explanation) ||
    !isTraceability(traceability)
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  return offer as unknown as PartnerRecommendedOffer;
}

function isExplanation(value: unknown): value is PartnerOfferExplanation {
  if (!value || typeof value !== 'object') return false;
  const explanation = value as Record<string, unknown>;
  return (
    isNonEmptyString(explanation['resumen']) &&
    Array.isArray(explanation['factoresDeterminantes']) &&
    explanation['factoresDeterminantes'].length > 0 &&
    explanation['factoresDeterminantes'].every((factor) => {
      if (!factor || typeof factor !== 'object') return false;
      const record = factor as Record<string, unknown>;
      return (
        isNonEmptyString(record['nombre']) &&
        isNonEmptyString(record['valor']) &&
        isNonEmptyString(record['impacto'])
      );
    })
  );
}

function isTraceability(value: unknown): value is PartnerOfferTraceability {
  if (!value || typeof value !== 'object') return false;
  const trace = value as Record<string, unknown>;
  return (
    Number.isInteger(trace['esquemaDecision']) &&
    Number(trace['esquemaDecision']) >= 1 &&
    isHash(trace['hashDecision']) &&
    isHash(trace['hashContenido']) &&
    typeof trace['perfilId'] === 'string' &&
    UUID_PATTERN.test(trace['perfilId']) &&
    Number.isInteger(trace['perfilVersion']) &&
    Number(trace['perfilVersion']) >= 1 &&
    isNonEmptyString(trace['modeloPerfilVersion']) &&
    typeof trace['reglaId'] === 'string' &&
    UUID_PATTERN.test(trace['reglaId']) &&
    isNonEmptyString(trace['reglaVersion']) &&
    Array.isArray(trace['fuentes']) &&
    trace['fuentes'].length > 0 &&
    trace['fuentes'].every((source) => {
      if (!source || typeof source !== 'object') return false;
      const record = source as Record<string, unknown>;
      return (
        ['open_finance', 'open_data'].includes(String(record['nombre'])) &&
        isNonEmptyString(record['version'])
      );
    })
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown[]): value is string[] {
  return value.length > 0 && value.every(isNonEmptyString);
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
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

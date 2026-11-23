import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OfferSelectionState,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
} from '../../core/offers/offer.models';
import { DocumentType, QuoteProductData } from '../../core/quotes/quote-request.models';
import { toProvisionalSelection, toSelectionState } from '../offers/http-offer.gateway';

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
  consentimientoEstado:
    'vigente' | 'insuficiente' | 'vencido' | 'revocado' | 'rechazado' | 'ausente';
}

export interface PartnerQuoteResult {
  operationId: string;
  socioId: string;
  clienteId: string;
  productoId: string;
  estado: 'completada';
  estadoSolicitud?: 'pendiente' | 'completada' | 'rechazada' | 'vencida';
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

export interface PartnerOfferOption {
  ofertaId: string;
  version: number;
  nombre: string;
  descripcion: string;
  prima: { monto: string; moneda: string };
  periodicidad: PartnerRecommendedOffer['periodicidad'];
  recomendada: boolean;
  coberturaPrincipal: string;
  deducible: string;
  vigencia: string;
  coberturas: string[];
  condiciones: string[];
  beneficiosAdicionales: string[];
  factores: { codigo: string; descripcion: string; valor: string }[];
}

export interface PartnerOfferSnapshot {
  ofertaId: string;
  operationId: string;
  socioId: string;
  clienteId: string;
  productoId: string;
  solicitudId: string;
  cotizacionId: string;
  estado: 'vigente' | 'vencida';
  calculadaEn: string;
  vigenteHasta: string;
  ofertas: PartnerOfferOption[];
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

  loadOfferSnapshot(operation: PartnerQuoteResult): Observable<PartnerOfferSnapshot> {
    return this.http
      .get<unknown>(`${this.url}/${encodeURIComponent(operation.operationId)}/oferta`, {
        params: { socioId: operation.socioId },
        headers: { 'API-Version': '1' },
      })
      .pipe(map((body) => parseSnapshot(body, operation)));
  }

  createOfferSnapshot(operation: PartnerQuoteResult): Observable<PartnerOfferSnapshot> {
    return this.http
      .post<unknown>(
        `${this.url}/${encodeURIComponent(operation.operationId)}/oferta`,
        {},
        {
          params: { socioId: operation.socioId },
          headers: { 'API-Version': '1', 'Idempotency-Key': operation.operationId },
        },
      )
      .pipe(map((body) => parseSnapshot(body, operation)));
  }

  loadOfferSelection(operation: PartnerQuoteResult): Observable<OfferSelectionState> {
    return this.http
      .get<unknown>(
        `${this.url}/${encodeURIComponent(operation.operationId)}/seleccion-provisional`,
        { params: { socioId: operation.socioId }, headers: { 'API-Version': '1' } },
      )
      .pipe(map((body) => toSelectionState(body, operation.solicitudId)));
  }

  saveOfferSelection(
    operation: PartnerQuoteResult,
    request: ProvisionalSelectionRequest,
  ): Observable<ProvisionalOfferSelection> {
    if (
      request.quoteId !== operation.solicitudId ||
      !UUID_PATTERN.test(request.offerId) ||
      !UUID_PATTERN.test(request.idempotencyKey) ||
      !Number.isSafeInteger(request.offerVersion) ||
      request.offerVersion < 1 ||
      !Number.isSafeInteger(request.expectedRevision) ||
      request.expectedRevision < 0
    ) {
      return throwError(() => new InvalidPartnerQuoteResponse());
    }
    return this.http
      .put<unknown>(
        `${this.url}/${encodeURIComponent(operation.operationId)}/seleccion-provisional`,
        {
          ofertaId: request.offerId,
          version: request.offerVersion,
          revisionEsperada: request.expectedRevision,
        },
        {
          params: { socioId: operation.socioId },
          headers: { 'API-Version': '1', 'Idempotency-Key': request.idempotencyKey },
        },
      )
      .pipe(
        map((body) => {
          const selection = toProvisionalSelection(body);
          if (
            request.quoteId !== operation.solicitudId ||
            selection.quoteId !== operation.solicitudId ||
            selection.offerId !== request.offerId ||
            selection.offerVersion !== request.offerVersion ||
            selection.revision !== request.expectedRevision + 1
          ) {
            throw new InvalidPartnerQuoteResponse();
          }
          return selection;
        }),
      );
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidPartnerQuoteResponse();
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (!isNonEmptyString(value)) throw new InvalidPartnerQuoteResponse();
  return value;
}

function uuidField(record: Record<string, unknown>, key: string): string {
  const value = stringField(record, key);
  if (!UUID_PATTERN.test(value)) throw new InvalidPartnerQuoteResponse();
  return value;
}

function instantField(record: Record<string, unknown>, key: string): string {
  const value = stringField(record, key);
  if (!Number.isFinite(Date.parse(value))) throw new InvalidPartnerQuoteResponse();
  return value;
}

function integerField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new InvalidPartnerQuoteResponse();
  }
  return value;
}

function stringsField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    throw new InvalidPartnerQuoteResponse();
  }
  return [...value];
}

function parseSnapshot(value: unknown, operation: PartnerQuoteResult): PartnerOfferSnapshot {
  const body = objectRecord(value);
  const estado = body['estado'];
  if (
    body['operationId'] !== operation.operationId ||
    body['socioId'] !== operation.socioId ||
    body['clienteId'] !== operation.clienteId ||
    body['productoId'] !== operation.productoId ||
    body['solicitudId'] !== operation.solicitudId ||
    body['cotizacionId'] !== operation.cotizacionId ||
    (estado !== 'vigente' && estado !== 'vencida') ||
    !isHash(body['hashContenido']) ||
    !Array.isArray(body['ofertas'])
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  const decision = objectRecord(body['decision']);
  if (!isHash(decision['hashDecision'])) throw new InvalidPartnerQuoteResponse();
  stringField(decision, 'modelo');
  uuidField(decision, 'reglaId');
  stringField(decision, 'reglaVersion');
  const risk = objectRecord(body['riesgo']);
  uuidField(risk, 'perfilId');
  integerField(risk, 'version');
  stringField(risk, 'modeloVersion');
  stringField(risk, 'score');
  uuidField(risk, 'consentimientoId');
  integerField(risk, 'consentimientoVersion');
  instantField(risk, 'calculadoEn');
  instantField(risk, 'vigenteHasta');
  if (
    !['A', 'B', 'C'].some((level) => level === risk['nivel']) ||
    typeof risk['fallbackUsed'] !== 'boolean' ||
    !Array.isArray(body['fuentes'])
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  for (const value of body['fuentes']) {
    const source = objectRecord(value);
    if (
      !['open_finance', 'open_data'].some((name) => name === source['nombre']) ||
      typeof source['simulada'] !== 'boolean'
    ) {
      throw new InvalidPartnerQuoteResponse();
    }
    stringField(source, 'version');
    stringField(source, 'indicadorRiesgo');
    instantField(source, 'consultadaEn');
    instantField(source, 'vigenteHasta');
  }
  const variables = objectRecord(body['variables']);
  for (const key of ['baseAsegurada', 'tasa', 'factorPerfil', 'score']) {
    stringField(variables, key);
  }
  integerField(variables, 'duracion');
  if (variables['moneda'] !== 'COP' || !isPeriodicity(variables['periodicidad'])) {
    throw new InvalidPartnerQuoteResponse();
  }
  const ofertas = body['ofertas'].map(parseSnapshotOffer);
  if (new Set(ofertas.map((offer) => offer.ofertaId)).size !== ofertas.length) {
    throw new InvalidPartnerQuoteResponse();
  }
  return {
    ofertaId: uuidField(body, 'ofertaId'),
    operationId: operation.operationId,
    socioId: operation.socioId,
    clienteId: operation.clienteId,
    productoId: operation.productoId,
    solicitudId: operation.solicitudId,
    cotizacionId: operation.cotizacionId,
    estado,
    calculadaEn: instantField(body, 'calculadaEn'),
    vigenteHasta: instantField(body, 'vigenteHasta'),
    ofertas,
  };
}

function parseSnapshotOffer(value: unknown): PartnerOfferOption {
  const offer = objectRecord(value);
  const premium = objectRecord(offer['prima']);
  const monto = stringField(premium, 'monto');
  const periodicidad = offer['periodicidad'];
  const recomendada = offer['recomendada'];
  if (
    !/^\d+\.\d{2}$/.test(monto) ||
    premium['moneda'] !== 'COP' ||
    !isPeriodicity(periodicidad) ||
    typeof recomendada !== 'boolean' ||
    !Array.isArray(offer['factores'])
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  return {
    ofertaId: uuidField(offer, 'ofertaId'),
    version: integerField(offer, 'version'),
    nombre: stringField(offer, 'nombre'),
    descripcion: stringField(offer, 'descripcion'),
    prima: { monto, moneda: 'COP' },
    periodicidad,
    recomendada,
    coberturaPrincipal: stringField(offer, 'coberturaPrincipal'),
    deducible: stringField(offer, 'deducible'),
    vigencia: stringField(offer, 'vigencia'),
    coberturas: stringsField(offer, 'coberturas'),
    condiciones: stringsField(offer, 'condiciones'),
    beneficiosAdicionales: stringsField(offer, 'beneficiosAdicionales'),
    factores: offer['factores'].map((value) => {
      const factor = objectRecord(value);
      return {
        codigo: stringField(factor, 'codigo'),
        descripcion: stringField(factor, 'descripcion'),
        valor: stringField(factor, 'valor'),
      };
    }),
  };
}

function isPeriodicity(value: unknown): value is PartnerRecommendedOffer['periodicidad'] {
  return ['mensual', 'por_viaje', 'por_vuelo', 'por_periodo'].some((item) => item === value);
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
    !['vigente', 'insuficiente', 'vencido', 'revocado', 'rechazado', 'ausente'].includes(
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
  const estadoSolicitud = 'estadoSolicitud' in body ? body.estadoSolicitud : undefined;
  if (
    estadoSolicitud !== undefined &&
    estadoSolicitud !== 'pendiente' &&
    estadoSolicitud !== 'completada' &&
    estadoSolicitud !== 'rechazada' &&
    estadoSolicitud !== 'vencida'
  ) {
    throw new InvalidPartnerQuoteResponse();
  }
  return {
    operationId,
    socioId,
    clienteId: body.clienteId,
    productoId: body.productoId,
    estado: body.estado,
    ...(estadoSolicitud !== undefined ? { estadoSolicitud } : {}),
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

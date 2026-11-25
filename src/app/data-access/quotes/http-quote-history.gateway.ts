import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OfferSelectionState } from '../../core/offers/offer.models';
import { toSelectionState } from '../offers/http-offer.gateway';
import {
  isQuotedPartnerClient,
  QuotedPartnerClient,
} from '../partners/http-partner-clients.gateway';
import { UUID_PATTERN } from './http-partner-quote.gateway';

export type QuoteBusinessStatus = 'pendiente' | 'completada' | 'rechazada' | 'vencida';
type QuotePaymentStatus = 'pendiente' | 'rechazado' | 'confirmado';
type QuoteEmissionStatus = 'pago_pendiente' | 'pago_confirmado' | 'emitida' | 'fallida';

export interface QuoteHistoryEntry {
  operationId: string | null;
  partnerId: string | null;
  clientId: string;
  requestId: string;
  quoteId: string;
  productId: string;
  status: QuoteBusinessStatus;
  createdAt: string;
  updatedAt: string;
  validUntil: string;
  completedAt: string | null;
  rejectedAt: string | null;
  selectionState: OfferSelectionState | null;
  selectionRestricted: boolean;
  paymentStatus: QuotePaymentStatus | null;
  emissionStatus: QuoteEmissionStatus | null;
}

export interface PartnerQuoteHistoryEntry extends QuoteHistoryEntry {
  operationId: string;
  partnerId: string;
  client: QuotedPartnerClient;
}

export interface QuoteRejectionReceipt {
  requestId: string;
  quoteId: string;
  status: 'rechazada';
  rejectedAt: string;
}

@Injectable({ providedIn: 'root' })
export class HttpQuoteHistoryGateway {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/v1`;
  private readonly headers = new HttpHeaders({ 'API-Version': '1' });

  loadClientHistory(clientId: string): Observable<QuoteHistoryEntry[]> {
    return this.http
      .get<unknown>(`${this.base}/solicitudes-cotizacion`, {
        headers: this.headers,
      })
      .pipe(
        map((body) => {
          const entries = parseHistory(body);
          if (
            entries.some(
              (entry) =>
                entry.clientId !== clientId || entry.selectionRestricted || !entry.selectionState,
            )
          ) {
            throw invalidHistory();
          }
          return entries;
        }),
      );
  }

  loadPartnerHistory(
    partnerId: string,
    allowedProducts: readonly string[],
  ): Observable<PartnerQuoteHistoryEntry[]> {
    return this.http
      .get<unknown>(`${this.base}/socios/solicitudes-cotizacion`, {
        params: { socioId: partnerId },
        headers: this.headers,
      })
      .pipe(
        map((body) => {
          const rawEntries = historyRows(body);
          const entries = rawEntries.map((raw) => {
            const entry = parseEntry(raw);
            if (
              !isRecord(raw) ||
              entry.partnerId !== partnerId ||
              !entry.operationId ||
              !allowedProducts.includes(entry.productId) ||
              !isQuotedPartnerClient(raw['cliente']) ||
              raw['cliente'].clienteId !== entry.clientId ||
              (raw['cliente'].consentimientoEstado !== 'vigente' && !entry.selectionRestricted)
            )
              throw invalidHistory();
            return {
              ...entry,
              operationId: entry.operationId,
              partnerId,
              client: { ...raw['cliente'] },
            };
          });
          return uniqueHistory(entries);
        }),
      );
  }

  loadClientState(requestId: string, clientId: string): Observable<QuoteHistoryEntry> {
    return this.http
      .get<unknown>(`${this.base}/solicitudes-cotizacion/${encodeURIComponent(requestId)}/estado`, {
        headers: this.headers,
      })
      .pipe(
        map((body) => {
          const entry = parseEntry(body);
          if (
            entry.requestId !== requestId ||
            entry.clientId !== clientId ||
            entry.selectionRestricted ||
            !entry.selectionState
          ) {
            throw invalidHistory();
          }
          return entry;
        }),
      );
  }

  reject(
    requestId: string,
    quoteId: string,
    idempotencyKey: string,
  ): Observable<QuoteRejectionReceipt> {
    if (!UUID_PATTERN.test(idempotencyKey)) throw new Error('Invalid rejection attempt key.');
    return this.http
      .put<unknown>(
        `${this.base}/solicitudes-cotizacion/${encodeURIComponent(requestId)}/rechazo`,
        {},
        { headers: this.headers.set('Idempotency-Key', idempotencyKey) },
      )
      .pipe(
        map((body) => {
          if (
            !isRecord(body) ||
            body['solicitudId'] !== requestId ||
            body['cotizacionId'] !== quoteId ||
            body['estado'] !== 'rechazada' ||
            !isInstant(body['rechazadaEn'])
          )
            throw invalidHistory();
          return { requestId, quoteId, status: 'rechazada', rejectedAt: body['rechazadaEn'] };
        }),
      );
  }
}

function parseHistory(body: unknown): QuoteHistoryEntry[] {
  return uniqueHistory(historyRows(body).map(parseEntry));
}

function historyRows(body: unknown): unknown[] {
  if (!isRecord(body) || !Array.isArray(body['solicitudes'])) throw invalidHistory();
  return body['solicitudes'];
}

function uniqueHistory<T extends QuoteHistoryEntry>(entries: T[]): T[] {
  const quoteIds = new Set(entries.map((entry) => entry.quoteId.toLowerCase()));
  const requestIds = new Set(entries.map((entry) => entry.requestId));
  if (quoteIds.size !== entries.length || requestIds.size !== entries.length)
    throw invalidHistory();
  return entries.sort(
    (a, b) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.quoteId.localeCompare(b.quoteId),
  );
}

function parseEntry(value: unknown): QuoteHistoryEntry {
  if (
    !isRecord(value) ||
    !(value['operationId'] === null || isUuid(value['operationId'])) ||
    !(value['socioId'] === null || nonempty(value['socioId'])) ||
    !isUuid(value['clienteId']) ||
    !isUuid(value['cotizacionId']) ||
    !nonempty(value['solicitudId']) ||
    !/^AQT-[0-9]{4}-[A-Z0-9]{6,12}$/.test(value['solicitudId']) ||
    !nonempty(value['productoId']) ||
    !isBusinessStatus(value['estado']) ||
    !isInstant(value['creadaEn']) ||
    !isInstant(value['actualizadaEn']) ||
    !isInstant(value['validaHasta']) ||
    !(value['completadaEn'] === null || isInstant(value['completadaEn'])) ||
    !(value['rechazadaEn'] === null || isInstant(value['rechazadaEn'])) ||
    typeof value['seleccionRestringida'] !== 'boolean' ||
    !isPaymentStatus(value['pagoEstado']) ||
    !isEmissionStatus(value['emisionEstado'])
  )
    throw invalidHistory();
  const selectionState =
    value['estadoSeleccion'] === null
      ? null
      : toSelectionState(value['estadoSeleccion'], value['solicitudId']);
  if (
    (value['seleccionRestringida'] && selectionState !== null) ||
    (value['estado'] === 'completada' &&
      (!value['completadaEn'] ||
        value['pagoEstado'] !== 'confirmado' ||
        (value['emisionEstado'] !== null && value['emisionEstado'] !== 'emitida'))) ||
    (value['estado'] === 'rechazada' && (!value['rechazadaEn'] || selectionState?.acceptance)) ||
    (value['estado'] === 'vencida' && value['pagoEstado'] === 'confirmado')
  )
    throw invalidHistory();
  return {
    operationId: value['operationId'],
    partnerId: value['socioId'],
    clientId: value['clienteId'],
    requestId: value['solicitudId'],
    quoteId: value['cotizacionId'],
    productId: value['productoId'],
    status: value['estado'],
    createdAt: value['creadaEn'],
    updatedAt: value['actualizadaEn'],
    validUntil: value['validaHasta'],
    completedAt: value['completadaEn'],
    rejectedAt: value['rechazadaEn'],
    selectionState,
    selectionRestricted: value['seleccionRestringida'],
    paymentStatus: value['pagoEstado'],
    emissionStatus: value['emisionEstado'],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim();
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
function isInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function isBusinessStatus(value: unknown): value is QuoteBusinessStatus {
  return (
    value === 'pendiente' || value === 'completada' || value === 'rechazada' || value === 'vencida'
  );
}
function isPaymentStatus(value: unknown): value is QuotePaymentStatus | null {
  return value === null || value === 'pendiente' || value === 'rechazado' || value === 'confirmado';
}
function isEmissionStatus(value: unknown): value is QuoteEmissionStatus | null {
  return (
    value === null ||
    value === 'pago_pendiente' ||
    value === 'pago_confirmado' ||
    value === 'emitida' ||
    value === 'fallida'
  );
}
function invalidHistory(): Error {
  return new Error('Invalid authoritative quote history response.');
}

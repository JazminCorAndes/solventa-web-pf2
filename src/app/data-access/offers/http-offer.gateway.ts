import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  offerUnavailableError,
  OfferSelectionChangedError,
  OfferUnavailableError,
} from '../../core/offers/offer.errors';
import { OfferGateway } from '../../core/offers/offer.gateway';
import {
  InsuranceOffer,
  isPremiumPeriodicity,
  Money,
  OfferCalculation,
  OfferSelectionState,
  OfferStatus,
  PremiumPeriodicity,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
  SelectedOfferRecord,
} from '../../core/offers/offer.models';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';

interface MoneyResponse {
  monto: string;
  moneda: string;
}

interface PremiumResponse {
  prima: MoneyResponse;
  periodicidad: PremiumPeriodicity;
  primaMensual?: MoneyResponse | null;
}

interface OfferResponse extends PremiumResponse {
  id: string;
  version: number;
  nombre: string;
  descripcion: string;
  coberturaPrincipal: string;
  deducible: string;
  vigencia: string;
  responsabilidadCivil: string;
  coberturas: string[];
  condiciones: string[];
  beneficiosAdicionales: string[];
  recomendada: boolean;
  estado: 'disponible' | 'aceptada' | 'vencida' | 'retirada';
  vigenteHasta: string;
}

interface OffersResponse {
  solicitudId: string;
  calculadaEn: string;
  vigenteHasta: string;
  tasaAplicada: string;
  ofertas: OfferResponse[];
}

interface SelectionResponse extends PremiumResponse {
  solicitudId: string;
  ofertaId: string;
  version: number;
  nombreOferta: string;
  seleccionadaEn: string;
}

interface ProvisionalSelectionResponse extends SelectionResponse {
  revision: number;
  vigenteHasta: string;
}

interface SelectionStateResponse {
  solicitudId: string;
  seleccion: ProvisionalSelectionResponse | null;
  aceptacion: SelectionResponse | null;
  estadoOferta: OfferResponse['estado'] | null;
}

@Injectable()
export class HttpOfferGateway implements OfferGateway {
  private readonly http = inject(HttpClient);
  private readonly quoteStorage = inject(QUOTE_REQUEST_STORAGE);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion`;

  loadOffers(): Observable<OfferCalculation> {
    const quoteId = this.quoteStorage.read()?.id;
    if (!quoteId) {
      return throwError(() => new Error('A quote request is required before loading offers.'));
    }
    return this.http.get<OffersResponse>(`${this.apiUrl}/${quoteId}/ofertas`).pipe(
      map((response) => ({
        quoteId: response.solicitudId,
        calculatedAt: response.calculadaEn,
        validUntil: response.vigenteHasta,
        appliedRate: response.tasaAplicada,
        offers: response.ofertas.map(toOffer),
      })),
    );
  }

  loadSelection(quoteId: string): Observable<SelectedOfferRecord | null> {
    return this.http.get<SelectionResponse>(`${this.apiUrl}/${quoteId}/seleccion`).pipe(
      map(toSelection),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  loadSelectionState(quoteId: string): Observable<OfferSelectionState> {
    return this.http
      .get<SelectionStateResponse>(
        `${this.apiUrl}/${encodeURIComponent(quoteId)}/seleccion-provisional`,
      )
      .pipe(map((response) => toSelectionState(response, quoteId)));
  }

  saveProvisionalSelection(
    request: ProvisionalSelectionRequest,
  ): Observable<ProvisionalOfferSelection> {
    return this.http
      .put<ProvisionalSelectionResponse>(
        `${this.apiUrl}/${encodeURIComponent(request.quoteId)}/seleccion-provisional`,
        {
          ofertaId: request.offerId,
          version: request.offerVersion,
          revisionEsperada: request.expectedRevision,
        },
        { headers: new HttpHeaders({ 'Idempotency-Key': request.idempotencyKey }) },
      )
      .pipe(
        map((response) => {
          const selection = toProvisionalSelection(response);
          if (
            selection.quoteId !== request.quoteId ||
            selection.offerId !== request.offerId ||
            selection.offerVersion !== request.offerVersion
          ) {
            throw new Error('The provisional receipt does not match the requested selection.');
          }
          return selection;
        }),
        catchError((error: unknown) => throwError(() => selectionError(error))),
      );
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
    selectionRevision?: number,
  ): Observable<SelectedOfferRecord> {
    return this.http
      .put<SelectionResponse>(
        `${this.apiUrl}/${quoteId}/seleccion`,
        {
          ofertaId: offerId,
          version: offerVersion,
          ...(selectionRevision === undefined ? {} : { revisionSeleccion: selectionRevision }),
        },
        {
          headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
        },
      )
      .pipe(
        map((response) => {
          const selection = toSelection(response);
          if (
            selection.quoteId !== quoteId ||
            selection.offerId !== offerId ||
            selection.offerVersion !== offerVersion
          ) {
            throw new Error('The acceptance does not match the requested selection.');
          }
          return selection;
        }),
        catchError((error: unknown) => {
          const mapped = selectionError(error);
          if (mapped !== error) {
            return throwError(() => mapped);
          }
          if (error instanceof HttpErrorResponse && error.status === 422) {
            if (profilingErrorKey(error)) {
              return throwError(() => error);
            }
            return throwError(() => new OfferUnavailableError());
          }
          return throwError(() => error);
        }),
      );
  }
}

function toOffer(response: OfferResponse): InsuranceOffer {
  return {
    id: response.id,
    version: response.version,
    name: response.nombre,
    description: response.descripcion,
    ...toPremium(response),
    coverageLabel: response.coberturaPrincipal,
    deductibleLabel: response.deducible,
    validityLabel: response.vigencia,
    liabilityLabel: response.responsabilidadCivil,
    coverages: response.coberturas,
    conditions: response.condiciones,
    additionalBenefits: response.beneficiosAdicionales,
    recommended: response.recomendada,
    status: toStatus(response.estado),
    validUntil: response.vigenteHasta,
  };
}

function toSelection(response: SelectionResponse): SelectedOfferRecord {
  if (
    !response ||
    typeof response !== 'object' ||
    typeof response.solicitudId !== 'string' ||
    !response.solicitudId ||
    typeof response.ofertaId !== 'string' ||
    !response.ofertaId ||
    !Number.isSafeInteger(response.version) ||
    response.version < 1 ||
    typeof response.nombreOferta !== 'string' ||
    !response.nombreOferta ||
    typeof response.seleccionadaEn !== 'string' ||
    !Number.isFinite(Date.parse(response.seleccionadaEn))
  ) {
    throw new Error('The selection response is invalid.');
  }
  return {
    quoteId: response.solicitudId,
    offerId: response.ofertaId,
    offerVersion: response.version,
    offerName: response.nombreOferta,
    ...toPremium(response),
    selectedAt: response.seleccionadaEn,
    confirmed: true,
  };
}

function toProvisionalSelection(response: ProvisionalSelectionResponse): ProvisionalOfferSelection {
  const selection = toSelection(response);
  if (
    !Number.isSafeInteger(response.revision) ||
    response.revision < 1 ||
    typeof response.vigenteHasta !== 'string' ||
    !response.vigenteHasta.endsWith('Z') ||
    !Number.isFinite(Date.parse(response.vigenteHasta))
  ) {
    throw new Error('The provisional selection revision or validity is invalid.');
  }
  return {
    ...selection,
    confirmed: false,
    revision: response.revision,
    validUntil: response.vigenteHasta,
  };
}

function toSelectionState(response: SelectionStateResponse, quoteId: string): OfferSelectionState {
  if (!response || typeof response !== 'object' || response.solicitudId !== quoteId) {
    throw new Error('The selection state does not match the requested quote.');
  }
  const selection = response.seleccion === null ? null : toProvisionalSelection(response.seleccion);
  const acceptance = response.aceptacion === null ? null : toSelection(response.aceptacion);
  const offerStatus = response.estadoOferta === null ? null : toStatus(response.estadoOferta);
  if (
    (selection && selection.quoteId !== quoteId) ||
    (acceptance && acceptance.quoteId !== quoteId) ||
    (selection === null) !== (offerStatus === null) ||
    (selection !== null && (acceptance !== null) !== (offerStatus === 'accepted'))
  ) {
    throw new Error('The selection state contains inconsistent references.');
  }
  return { quoteId, selection, acceptance, offerStatus };
}

function selectionError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || !('code' in body)) {
    return error;
  }
  if (
    error.status === 409 &&
    (body.code === 'seleccion_desactualizada' || body.code === 'seleccion_no_modificable')
  ) {
    return new OfferSelectionChangedError();
  }
  return offerUnavailableError(error) ?? error;
}

function toPremium(response: PremiumResponse): {
  premium: Money;
  periodicity: PremiumPeriodicity;
} {
  if (!isPremiumPeriodicity(response.periodicidad)) {
    throw new Error('The offer contains an invalid premium periodicity.');
  }
  return { premium: toMoney(response.prima), periodicity: response.periodicidad };
}

function toMoney(response: MoneyResponse | null | undefined): Money {
  if (!response || typeof response.monto !== 'string' || !/^\d+(?:\.\d+)?$/.test(response.monto)) {
    throw new Error('The offer contains an invalid monetary amount.');
  }
  const amount = Number(response.monto);
  if (
    !Number.isFinite(amount) ||
    typeof response.moneda !== 'string' ||
    !/^[A-Z]{3}$/.test(response.moneda)
  ) {
    throw new Error('The offer contains an invalid monetary amount.');
  }
  return { amount, currency: response.moneda };
}

function toStatus(status: OfferResponse['estado']): OfferStatus {
  const statuses: Record<OfferResponse['estado'], OfferStatus> = {
    disponible: 'available',
    aceptada: 'accepted',
    vencida: 'expired',
    retirada: 'withdrawn',
  };
  if (!Object.hasOwn(statuses, status)) {
    throw new Error('The offer contains an invalid status.');
  }
  return statuses[status];
}

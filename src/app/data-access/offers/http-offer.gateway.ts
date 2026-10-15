import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { OfferGateway } from '../../core/offers/offer.gateway';
import {
  InsuranceOffer,
  OfferCalculation,
  OfferStatus,
  SelectedOfferRecord,
} from '../../core/offers/offer.models';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';

interface MoneyResponse {
  monto: string;
  moneda: string;
}

interface OfferResponse {
  id: string;
  version: number;
  nombre: string;
  descripcion: string;
  primaMensual: MoneyResponse;
  coberturaPrincipal: string;
  deducible: string;
  vigencia: string;
  responsabilidadCivil: string;
  coberturas: string[];
  condiciones: string[];
  beneficiosAdicionales: string[];
  recomendada: boolean;
  estado: 'disponible' | 'vencida' | 'retirada';
  vigenteHasta: string;
}

interface OffersResponse {
  solicitudId: string;
  calculadaEn: string;
  vigenteHasta: string;
  tasaAplicada: string;
  ofertas: OfferResponse[];
}

interface SelectionResponse {
  solicitudId: string;
  ofertaId: string;
  version: number;
  nombreOferta: string;
  primaMensual: MoneyResponse;
  seleccionadaEn: string;
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
    return this.http
      .get<OffersResponse>(`${this.apiUrl}/${quoteId}/ofertas`)
      .pipe(
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
    return this.http
      .get<SelectionResponse>(`${this.apiUrl}/${quoteId}/seleccion`)
      .pipe(
        map(toSelection),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return of(null);
          }
          return throwError(() => error);
        }),
      );
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
  ): Observable<SelectedOfferRecord> {
    return this.http
      .put<SelectionResponse>(
        `${this.apiUrl}/${quoteId}/seleccion`,
        { ofertaId: offerId, version: offerVersion },
        {
          headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
        },
      )
      .pipe(
        map(toSelection),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 422) {
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
    monthlyPremium: toMoney(response.primaMensual),
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
  return {
    quoteId: response.solicitudId,
    offerId: response.ofertaId,
    offerVersion: response.version,
    offerName: response.nombreOferta,
    monthlyPremium: toMoney(response.primaMensual),
    selectedAt: response.seleccionadaEn,
  };
}

function toMoney(response: MoneyResponse): { amount: number; currency: string } {
  const amount = Number(response.monto);
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(response.moneda)) {
    throw new Error('The offer contains an invalid monetary amount.');
  }
  return { amount, currency: response.moneda };
}

function toStatus(status: OfferResponse['estado']): OfferStatus {
  const statuses: Record<OfferResponse['estado'], OfferStatus> = {
    disponible: 'available',
    vencida: 'expired',
    retirada: 'withdrawn',
  };
  return statuses[status];
}

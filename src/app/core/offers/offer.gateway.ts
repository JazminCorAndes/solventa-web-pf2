import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  OfferCalculation,
  OfferSelectionState,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
  SelectedOfferRecord,
} from './offer.models';

export interface OfferGateway {
  loadOffers(): Observable<OfferCalculation>;
  loadSelection(quoteId: string): Observable<SelectedOfferRecord | null>;
  loadSelectionState(quoteId: string): Observable<OfferSelectionState>;
  saveProvisionalSelection(
    request: ProvisionalSelectionRequest,
  ): Observable<ProvisionalOfferSelection>;
  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
    selectionRevision?: number,
  ): Observable<SelectedOfferRecord>;
}

export const OFFER_GATEWAY = new InjectionToken<OfferGateway>('OFFER_GATEWAY');

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { OfferCalculation, SelectedOfferRecord } from './offer.models';

export interface OfferGateway {
  loadOffers(): Observable<OfferCalculation>;
  loadSelection(quoteId: string): Observable<SelectedOfferRecord | null>;
  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
  ): Observable<SelectedOfferRecord>;
}

export const OFFER_GATEWAY = new InjectionToken<OfferGateway>('OFFER_GATEWAY');

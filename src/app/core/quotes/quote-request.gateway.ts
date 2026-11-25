import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ClientQuoteProfile,
  InsuranceProduct,
  InsuranceProductDetail,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from './quote-request.models';

export interface QuoteRequestGateway {
  loadClientProfile(): Observable<ClientQuoteProfile>;
  loadRequest(id: string): Observable<QuoteRequestRecord>;
  loadProducts(): Observable<InsuranceProduct[]>;
  loadProductDetail(id: string): Observable<InsuranceProductDetail>;
  loadTravelDestinations(): Observable<TravelDestination[]>;
  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord>;
}

export const QUOTE_REQUEST_GATEWAY = new InjectionToken<QuoteRequestGateway>(
  'QUOTE_REQUEST_GATEWAY',
);

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from './quote-request.models';

export interface QuoteRequestGateway {
  loadProducts(): Observable<InsuranceProduct[]>;
  loadTravelDestinations(): Observable<TravelDestination[]>;
  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord>;
}

export const QUOTE_REQUEST_GATEWAY = new InjectionToken<QuoteRequestGateway>(
  'QUOTE_REQUEST_GATEWAY',
);

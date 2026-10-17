import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { InsuranceProductDetail, InsuranceProductSummary } from './insurance-catalog.models';

export interface InsuranceCatalogGateway {
  loadProducts(): Observable<InsuranceProductSummary[]>;
  loadProduct(productId: string): Observable<InsuranceProductDetail | null>;
}

export const INSURANCE_CATALOG_GATEWAY = new InjectionToken<InsuranceCatalogGateway>(
  'INSURANCE_CATALOG_GATEWAY',
);

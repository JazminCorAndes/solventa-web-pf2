import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';
import {
  InsuranceProductUnavailableError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestGateway } from '../../core/quotes/quote-request.gateway';
import {
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
} from '../../core/quotes/quote-request.models';
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';

const PRODUCTS: InsuranceProduct[] = [
  {
    id: 'automotive',
    name: 'Seguro Automotriz Total',
    description: 'Protección para tu vehículo, ocupantes y terceros.',
    available: true,
  },
  {
    id: 'travel',
    name: 'Seguro de Viaje',
    description: 'Protección para viajes nacionales e internacionales.',
    available: false,
  },
  {
    id: 'life',
    name: 'Seguro de Vida',
    description: 'Respaldo financiero para ti y tu familia.',
    available: false,
  },
];

@Injectable()
export class MockQuoteRequestGateway implements QuoteRequestGateway {
  private readonly profiling = inject(MockProfilingGateway);
  loadProducts(): Observable<InsuranceProduct[]> {
    return of(PRODUCTS).pipe(delay(250));
  }

  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    return of(null).pipe(
      delay(700),
      map(() => {
        if (request.email === 'indisponible@solventa.co') {
          throw new QuoteRequestUnavailableError();
        }

        const product = PRODUCTS.find((item) => item.id === request.productId);
        if (!product?.available) {
          throw new InsuranceProductUnavailableError();
        }

        const id = generateQuoteId();
        this.profiling.createProfile(id);
        return {
          ...request,
          id,
          status: 'received',
          createdAt: new Date().toISOString(),
        };
      }),
    );
  }
}

function generateQuoteId(): string {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-6);
  return `AQT-${year}-${suffix}`;
}

import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  InsuranceProductUnavailableError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestGateway } from '../../core/quotes/quote-request.gateway';
import {
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from '../../core/quotes/quote-request.models';
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';

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
    available: true,
  },
  {
    id: 'life',
    name: 'Microseguro de Vida',
    description: 'Respaldo financiero accesible para ti y tu familia.',
    available: true,
  },
  {
    id: 'device-protection',
    name: 'Protección de Dispositivos',
    description: 'Cobertura para daños, hurto y fallas de tus dispositivos.',
    available: true,
  },
  {
    id: 'parametric',
    name: 'Seguro de Vuelos',
    description: 'Protección ante retrasos, cancelaciones o pérdida de conexión, según el plan.',
    available: true,
  },
  {
    id: 'parametric-weather',
    name: 'Seguro Paramétrico Climático',
    description: 'Protección ante lluvia intensa o sequía durante el periodo asegurado.',
    available: true,
  },
  {
    id: 'payment-protection',
    name: 'Protección de Pagos',
    description: 'Respaldo de obligaciones financieras asociadas a créditos.',
    available: true,
  },
  {
    id: 'mortgage-life',
    name: 'Seguro de Vida Hipotecario',
    description: 'Protección personalizada para el saldo de tu crédito de vivienda.',
    available: true,
  },
];

const TRAVEL_DESTINATIONS: TravelDestination[] = [
  { code: 'DE', name: 'Alemania' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CA', name: 'Canadá' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KR', name: 'Corea del Sur' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'ES', name: 'España' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'FR', name: 'Francia' },
  { code: 'GR', name: 'Grecia' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'IT', name: 'Italia' },
  { code: 'JP', name: 'Japón' },
  { code: 'MX', name: 'México' },
  { code: 'NZ', name: 'Nueva Zelanda' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'PA', name: 'Panamá' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Perú' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'SE', name: 'Suecia' },
  { code: 'CH', name: 'Suiza' },
  { code: 'TR', name: 'Turquía' },
  { code: 'UY', name: 'Uruguay' },
];

@Injectable()
export class MockQuoteRequestGateway implements QuoteRequestGateway {
  private readonly storage = inject(QUOTE_REQUEST_STORAGE);
  private readonly auth = inject(AuthService);
  private readonly profiling = inject(MockProfilingGateway);

  loadRequest(id: string): Observable<QuoteRequestRecord> {
    const request = this.storage.read();
    return request?.id === id
      ? of(request)
      : throwError(() => new Error('The simulated quote request is not available.'));
  }

  loadProducts(): Observable<InsuranceProduct[]> {
    return of(PRODUCTS).pipe(delay(250));
  }

  loadTravelDestinations(): Observable<TravelDestination[]> {
    return of(TRAVEL_DESTINATIONS).pipe(delay(250));
  }

  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    return of(null).pipe(
      delay(700),
      map(() => {
        const user = this.auth.user();
        if (user?.email === 'indisponible@solventa.co') {
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
          customerType: 'natural' as const,
          documentType: user?.documentType ?? 'cc',
          nationalId: user?.nationalId ?? '',
          email: user?.email ?? '',
          phone: user?.phone ?? '',
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

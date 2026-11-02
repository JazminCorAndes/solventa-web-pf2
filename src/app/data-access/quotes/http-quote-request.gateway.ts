import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  InsuranceProductUnavailableError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestGateway } from '../../core/quotes/quote-request.gateway';
import {
  DocumentType,
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from '../../core/quotes/quote-request.models';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';

interface ProductsResponse {
  productos: Array<{
    id: string;
    nombre: string;
    descripcion: string;
    disponible: boolean;
  }>;
}

interface QuoteRequestResponse {
  id: string;
  productoId: string;
  tipoCliente: 'persona_natural';
  tipoDocumento: DocumentType;
  identificacion: string;
  datosProducto: Record<string, string>;
  correo: string;
  telefono: string;
  estado: 'recibida';
  creadaEn: string;
}

interface TravelDestinationsResponse {
  destinos: Array<{
    codigo: string;
    nombre: string;
  }>;
}

@Injectable()
export class HttpQuoteRequestGateway implements QuoteRequestGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1`;

  loadRequest(id: string): Observable<QuoteRequestRecord> {
    return this.http
      .get<QuoteRequestResponse>(`${this.apiUrl}/solicitudes-cotizacion/${encodeURIComponent(id)}`)
      .pipe(map(toQuoteRequest));
  }

  loadProducts(): Observable<InsuranceProduct[]> {
    return this.http.get<ProductsResponse>(`${this.apiUrl}/productos-seguro`).pipe(
      map((response) =>
        response.productos.map((product) => ({
          id: product.id,
          name: product.nombre,
          description: product.descripcion,
          available: product.disponible,
        })),
      ),
      catchError((error: unknown) => this.mapUnavailable(error)),
    );
  }

  loadTravelDestinations(): Observable<TravelDestination[]> {
    return this.http.get<TravelDestinationsResponse>(`${this.apiUrl}/destinos-viaje`).pipe(
      map((response) =>
        response.destinos.map((destination) => ({
          code: destination.codigo,
          name: destination.nombre,
        })),
      ),
      catchError((error: unknown) => this.mapUnavailable(error)),
    );
  }

  submitRequest(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    return this.http
      .post<QuoteRequestResponse>(
        `${this.apiUrl}/solicitudes-cotizacion`,
        {
          productoId: request.productId,
          datosProducto: request.productData,
        },
        {
          headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
        },
      )
      .pipe(
        map(toQuoteRequest),
        catchError((error: unknown) => {
          if (profilingErrorKey(error)) {
            return throwError(() => error);
          }

          if (error instanceof HttpErrorResponse && error.status === 422) {
            return throwError(() => new InsuranceProductUnavailableError());
          }
          return this.mapUnavailable(error);
        }),
      );
  }

  private mapUnavailable(error: unknown): Observable<never> {
    if (error instanceof HttpErrorResponse && (error.status === 0 || error.status === 503)) {
      return throwError(() => new QuoteRequestUnavailableError());
    }
    return throwError(() => error);
  }
}

function toQuoteRequest(response: QuoteRequestResponse): QuoteRequestRecord {
  return {
    id: response.id,
    productId: response.productoId,
    customerType: 'natural',
    documentType: response.tipoDocumento,
    nationalId: response.identificacion,
    productData: response.datosProducto,
    email: response.correo,
    phone: response.telefono,
    status: 'received',
    createdAt: response.creadaEn,
  };
}

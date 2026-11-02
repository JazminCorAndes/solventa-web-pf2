import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  InsuranceProductUnavailableError,
  InsuranceProductNotFoundError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestGateway } from '../../core/quotes/quote-request.gateway';
import {
  DocumentType,
  InsuranceProduct,
  InsuranceProductDetail,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from '../../core/quotes/quote-request.models';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';

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
    return this.http.get<unknown>(`${this.apiUrl}/productos-seguro`).pipe(
      map((response) => {
        if (!isRecord(response) || !Array.isArray(response['productos'])) {
          throw new Error('Invalid insurance catalog response');
        }
        return response['productos'].map(toProduct);
      }),
      catchError((error: unknown) => this.mapUnavailable(error)),
    );
  }

  loadProductDetail(id: string): Observable<InsuranceProductDetail> {
    return this.http.get<unknown>(`${this.apiUrl}/productos-seguro/${encodeURIComponent(id)}`).pipe(
      map((response) => toProductDetail(response, id)),
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 404 &&
          isRecord(error.error) &&
          error.error['code'] === 'seguro_no_encontrado'
        ) {
          return throwError(() => new InsuranceProductNotFoundError());
        }
        return this.mapUnavailable(error);
      }),
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

function toProduct(response: unknown): InsuranceProduct {
  if (
    !isRecord(response) ||
    typeof response['id'] !== 'string' ||
    typeof response['nombre'] !== 'string' ||
    typeof response['descripcion'] !== 'string' ||
    typeof response['disponible'] !== 'boolean' ||
    !isStringArray(response['coberturasPrincipales'])
  ) {
    throw new Error('Invalid insurance product response');
  }
  return {
    id: response['id'],
    name: response['nombre'],
    description: response['descripcion'],
    available: response['disponible'],
    mainCoverages: response['coberturasPrincipales'],
  };
}

function toProductDetail(response: unknown, id: string): InsuranceProductDetail {
  const product = toProduct(response);
  if (!isRecord(response)) {
    throw new Error('Invalid insurance product detail response');
  }
  const coverages = response['coberturas'];
  const conditions = response['condiciones'];
  const information = response['informacionRelevante'];
  if (
    product.id !== id ||
    !Array.isArray(coverages) ||
    !coverages.every(
      (coverage): coverage is { nombre: string; descripcion: string } =>
        isRecord(coverage) &&
        typeof coverage['nombre'] === 'string' &&
        typeof coverage['descripcion'] === 'string',
    ) ||
    !isStringArray(conditions) ||
    !isRecord(information) ||
    typeof information['sumaAsegurada'] !== 'string' ||
    typeof information['deducible'] !== 'string' ||
    typeof information['moneda'] !== 'string' ||
    typeof information['vigencia'] !== 'string'
  ) {
    throw new Error('Invalid insurance product detail response');
  }
  return {
    ...product,
    coverages: coverages.map((coverage) => ({
      name: coverage.nombre,
      description: coverage.descripcion,
    })),
    conditions,
    information: {
      insuredAmount: information['sumaAsegurada'],
      deductible: information['deducible'],
      currency: information['moneda'],
      validity: information['vigencia'],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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

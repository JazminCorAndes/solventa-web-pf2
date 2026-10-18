import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InsuranceCatalogGateway } from '../../core/insurance-catalog/insurance-catalog.gateway';
import {
  InsuranceProductDetail,
  InsuranceProductSummary,
} from '../../core/insurance-catalog/insurance-catalog.models';

interface ProductSummaryResponse {
  id: string;
  nombre: string;
  descripcion: string;
  disponible: boolean;
  coberturasPrincipales: string[];
}

interface ProductDetailResponse extends ProductSummaryResponse {
  coberturas: Array<{
    nombre: string;
    descripcion: string;
  }>;
  condiciones: string[];
  informacionRelevante: {
    sumaAsegurada: string;
    deducible: string;
    moneda: string;
    vigencia: string;
  };
}

@Injectable()
export class HttpInsuranceCatalogGateway implements InsuranceCatalogGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1/productos-seguro`;

  loadProducts(): Observable<InsuranceProductSummary[]> {
    return this.http
      .get<{ productos: ProductSummaryResponse[] }>(this.apiUrl)
      .pipe(map((response) => response.productos.map(toSummary)));
  }

  loadProduct(productId: string): Observable<InsuranceProductDetail | null> {
    return this.http.get<ProductDetailResponse>(`${this.apiUrl}/${productId}`).pipe(
      map(toDetail),
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 404 &&
          error.error?.code === 'seguro_no_encontrado'
        ) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }
}

function toSummary(response: ProductSummaryResponse): InsuranceProductSummary {
  if (
    typeof response.id !== 'string' ||
    typeof response.nombre !== 'string' ||
    typeof response.descripcion !== 'string' ||
    typeof response.disponible !== 'boolean' ||
    !Array.isArray(response.coberturasPrincipales) ||
    !response.coberturasPrincipales.every((coverage) => typeof coverage === 'string')
  ) {
    throw new Error('The catalog contains an invalid product.');
  }
  return {
    id: response.id,
    name: response.nombre,
    description: response.descripcion,
    available: response.disponible,
    mainCoverages: response.coberturasPrincipales,
  };
}

function toDetail(response: ProductDetailResponse): InsuranceProductDetail {
  const information = response.informacionRelevante;
  if (
    !information ||
    typeof information.moneda !== 'string' ||
    !/^[A-Z]{3}$/.test(information.moneda) ||
    typeof information.vigencia !== 'string' ||
    !Array.isArray(response.coberturas) ||
    !response.coberturas.every(
      (coverage) =>
        coverage && typeof coverage.nombre === 'string' && typeof coverage.descripcion === 'string',
    ) ||
    !Array.isArray(response.condiciones) ||
    !response.condiciones.every((condition) => typeof condition === 'string')
  ) {
    throw new Error('The catalog contains an invalid product detail.');
  }
  return {
    ...toSummary(response),
    coverages: response.coberturas.map((coverage) => ({
      name: coverage.nombre,
      description: coverage.descripcion,
    })),
    conditions: response.condiciones,
    relevantInformation: {
      insuredAmount: toAmount(information.sumaAsegurada),
      deductible: toAmount(information.deducible),
      currency: response.informacionRelevante.moneda,
      term: response.informacionRelevante.vigencia,
    },
  };
}

function toAmount(value: string): number {
  if (
    typeof value !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(value) ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error('The catalog contains an invalid monetary amount.');
  }
  return Number(value);
}

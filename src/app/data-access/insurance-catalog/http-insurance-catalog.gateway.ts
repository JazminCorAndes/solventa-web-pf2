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
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }
}

function toSummary(response: ProductSummaryResponse): InsuranceProductSummary {
  return {
    id: response.id,
    name: response.nombre,
    description: response.descripcion,
    available: response.disponible,
    mainCoverages: response.coberturasPrincipales,
  };
}

function toDetail(response: ProductDetailResponse): InsuranceProductDetail {
  return {
    ...toSummary(response),
    coverages: response.coberturas.map((coverage) => ({
      name: coverage.nombre,
      description: coverage.descripcion,
    })),
    conditions: response.condiciones,
    relevantInformation: {
      insuredAmount: Number(response.informacionRelevante.sumaAsegurada),
      deductible: Number(response.informacionRelevante.deducible),
      currency: response.informacionRelevante.moneda,
      term: response.informacionRelevante.vigencia,
    },
  };
}

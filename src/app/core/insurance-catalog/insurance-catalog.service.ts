import { inject, Injectable, signal } from '@angular/core';
import { finalize, take } from 'rxjs';
import { INSURANCE_CATALOG_GATEWAY } from './insurance-catalog.gateway';
import { InsuranceProductDetail, InsuranceProductSummary } from './insurance-catalog.models';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type ProductDetailStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

@Injectable({ providedIn: 'root' })
export class InsuranceCatalogService {
  private readonly gateway = inject(INSURANCE_CATALOG_GATEWAY);
  private readonly productsState = signal<InsuranceProductSummary[]>([]);
  private readonly selectedProductState = signal<InsuranceProductDetail | null>(null);
  private readonly catalogStatusState = signal<CatalogStatus>('idle');
  private readonly detailStatusState = signal<ProductDetailStatus>('idle');

  readonly products = this.productsState.asReadonly();
  readonly selectedProduct = this.selectedProductState.asReadonly();
  readonly catalogStatus = this.catalogStatusState.asReadonly();
  readonly detailStatus = this.detailStatusState.asReadonly();

  loadProducts(): void {
    if (this.catalogStatusState() === 'loading') {
      return;
    }
    this.productsState.set([]);
    this.catalogStatusState.set('loading');
    this.gateway
      .loadProducts()
      .pipe(
        take(1),
        finalize(() => {
          if (this.catalogStatusState() === 'loading') {
            this.catalogStatusState.set('error');
          }
        }),
      )
      .subscribe({
        next: (products) => {
          this.productsState.set(products);
          this.catalogStatusState.set(products.length ? 'ready' : 'empty');
        },
        error: (error: unknown) => {
          console.error('Insurance catalog could not be loaded.', error);
          this.productsState.set([]);
          this.catalogStatusState.set('error');
        },
      });
  }

  loadProduct(productId: string): void {
    this.selectedProductState.set(null);
    this.detailStatusState.set('loading');
    this.gateway
      .loadProduct(productId)
      .pipe(
        take(1),
        finalize(() => {
          if (this.detailStatusState() === 'loading') {
            this.detailStatusState.set('error');
          }
        }),
      )
      .subscribe({
        next: (product) => {
          this.selectedProductState.set(product);
          this.detailStatusState.set(product ? 'ready' : 'not-found');
        },
        error: (error: unknown) => {
          console.error('Insurance product detail could not be loaded.', error);
          this.selectedProductState.set(null);
          this.detailStatusState.set('error');
        },
      });
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, take, tap } from 'rxjs';
import { OFFER_SELECTION_STORAGE } from '../offers/offer-selection-storage.service';
import { QUOTE_REQUEST_GATEWAY } from './quote-request.gateway';
import {
  InsuranceProduct,
  QuoteRequestDraft,
  QuoteRequestRecord,
  TravelDestination,
} from './quote-request.models';
import { QUOTE_REQUEST_STORAGE } from './quote-request-storage.service';

type ProductCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class QuoteRequestService {
  private readonly gateway = inject(QUOTE_REQUEST_GATEWAY);
  private readonly storage = inject(QUOTE_REQUEST_STORAGE);
  private readonly offerSelectionStorage = inject(OFFER_SELECTION_STORAGE);
  private readonly productsState = signal<InsuranceProduct[]>([]);
  private readonly travelDestinationsState = signal<TravelDestination[]>([]);
  private readonly catalogStatusState = signal<ProductCatalogStatus>('idle');
  private readonly travelDestinationsStatusState = signal<ProductCatalogStatus>('idle');
  private readonly latestRequestState = signal<QuoteRequestRecord | null>(this.storage.read());

  readonly products = this.productsState.asReadonly();
  readonly travelDestinations = this.travelDestinationsState.asReadonly();
  readonly catalogStatus = this.catalogStatusState.asReadonly();
  readonly travelDestinationsStatus = this.travelDestinationsStatusState.asReadonly();
  readonly latestRequest = this.latestRequestState.asReadonly();
  readonly availableProducts = computed(() =>
    this.productsState().filter((product) => product.available),
  );

  loadProducts(): void {
    if (this.catalogStatusState() === 'loading') {
      return;
    }

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
          this.catalogStatusState.set('ready');
        },
        error: (error: unknown) => {
          console.error('Insurance products could not be loaded.', error);
          this.catalogStatusState.set('error');
        },
      });
  }

  loadTravelDestinations(): void {
    if (this.travelDestinationsStatusState() === 'loading') {
      return;
    }

    this.travelDestinationsStatusState.set('loading');
    this.gateway
      .loadTravelDestinations()
      .pipe(
        take(1),
        finalize(() => {
          if (this.travelDestinationsStatusState() === 'loading') {
            this.travelDestinationsStatusState.set('error');
          }
        }),
      )
      .subscribe({
        next: (destinations) => {
          this.travelDestinationsState.set(destinations);
          this.travelDestinationsStatusState.set('ready');
        },
        error: (error: unknown) => {
          console.error('Travel destinations could not be loaded.', error);
          this.travelDestinationsStatusState.set('error');
        },
      });
  }

  submit(request: QuoteRequestDraft): Observable<QuoteRequestRecord> {
    return this.gateway.submitRequest(request).pipe(
      tap((record) => {
        this.offerSelectionStorage.clear();
        this.storage.write(record);
        this.latestRequestState.set(record);
      }),
    );
  }

  activate(request: QuoteRequestRecord): void {
    this.storage.write(request);
    this.latestRequestState.set(request);
  }
}

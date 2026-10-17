import { inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { QUOTE_REQUEST_STORAGE } from '../quotes/quote-request-storage.service';
import { SUBSCRIPTION_GATEWAY } from './subscription.gateway';
import { SubscriptionRecord } from './subscription.models';
import { SUBSCRIPTION_STORAGE } from './subscription-storage.service';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly gateway = inject(SUBSCRIPTION_GATEWAY);
  private readonly quoteStorage = inject(QUOTE_REQUEST_STORAGE);
  private readonly storage = inject(SUBSCRIPTION_STORAGE);

  readonly subscription = signal<SubscriptionRecord | null>(this.storage.read());
  readonly loading = signal(false);
  readonly error = signal(false);

  start(): Observable<SubscriptionRecord> {
    const quoteId = this.requiredQuoteId();
    this.loading.set(true);
    this.error.set(false);
    return this.gateway.start(quoteId).pipe(
      tap((subscription) => this.store(subscription)),
      tap({
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
        complete: () => this.loading.set(false),
      }),
    );
  }

  load(): void {
    const quoteId = this.quoteStorage.read()?.id;
    if (!quoteId) {
      return;
    }
    this.loading.set(true);
    this.gateway
      .load(quoteId)
      .pipe(
        catchError(() => {
          this.error.set(true);
          return of(null);
        }),
      )
      .subscribe((subscription) => {
        this.loading.set(false);
        if (subscription) {
          this.store(subscription);
        }
      });
  }

  private requiredQuoteId(): string {
    const quoteId = this.quoteStorage.read()?.id;
    if (!quoteId) {
      throw new Error('A quote request is required before starting a subscription.');
    }
    return quoteId;
  }

  private store(subscription: SubscriptionRecord): void {
    this.subscription.set(subscription);
    this.storage.write(subscription);
  }
}

import { inject, Injectable, signal } from '@angular/core';
import { catchError, Observable, of, tap } from 'rxjs';
import { QUOTE_REQUEST_STORAGE } from '../quotes/quote-request-storage.service';
import { PAYMENT_GATEWAY } from './payment.gateway';
import { PaymentPolicyRecord } from './payment.models';
import { PAYMENT_STORAGE } from './payment-storage.service';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly gateway = inject(PAYMENT_GATEWAY);
  private readonly quoteStorage = inject(QUOTE_REQUEST_STORAGE);
  private readonly storage = inject(PAYMENT_STORAGE);

  readonly result = signal<PaymentPolicyRecord | null>(this.storage.read());
  readonly loading = signal(false);
  readonly error = signal(false);

  pay(): Observable<PaymentPolicyRecord> {
    const quoteId = this.requiredQuoteId();
    this.loading.set(true);
    this.error.set(false);
    return this.gateway.pay(quoteId).pipe(
      tap((record) => this.store(record)),
      tap({
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
        complete: () => this.loading.set(false),
      }),
    );
  }

  loadPolicy(): void {
    const quoteId = this.quoteStorage.read()?.id;
    if (!quoteId) {
      return;
    }
    this.loading.set(true);
    this.gateway
      .loadPolicy(quoteId)
      .pipe(
        catchError(() => {
          this.error.set(true);
          return of(null);
        }),
      )
      .subscribe((record) => {
        this.loading.set(false);
        if (record) {
          this.store(record);
        }
      });
  }

  private requiredQuoteId(): string {
    const quoteId = this.quoteStorage.read()?.id;
    if (!quoteId) {
      throw new Error('A quote request is required before processing a payment.');
    }
    return quoteId;
  }

  private store(record: PaymentPolicyRecord): void {
    this.result.set(record);
    this.storage.write(record);
  }
}

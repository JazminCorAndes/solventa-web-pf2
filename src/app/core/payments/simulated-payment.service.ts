import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, defer, finalize, forkJoin, map, Observable, of, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import { SelectedOfferRecord } from '../offers/offer.models';
import { SubscriptionRecord } from '../subscriptions/subscription.models';
import { SIMULATED_PAYMENT_GATEWAY } from './simulated-payment.gateway';
import { SimulatedPaymentRecord } from './simulated-payment.models';

@Injectable({ providedIn: 'root' })
export class SimulatedPaymentService {
  private readonly gateway = inject(SIMULATED_PAYMENT_GATEWAY);
  private readonly offers = inject(OFFER_GATEWAY);
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private subscription: SubscriptionRecord | null = null;

  readonly available = environment.dataAccessMode === 'backend';
  readonly payment = signal<SimulatedPaymentRecord | null>(null);
  readonly selection = signal<SelectedOfferRecord | null>(null);
  readonly loading = signal(false);
  readonly confirming = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly canConfirm = computed(
    () =>
      !!this.selection() &&
      this.subscription?.saga.status === 'payment_pending' &&
      !this.payment() &&
      !this.loading() &&
      !this.confirming() &&
      !['payment.errors.notAllowed', 'payment.errors.notFound', 'payment.errors.conflict'].includes(
        this.errorKey() ?? '',
      ),
  );

  reset(): void {
    this.subscription = null;
    this.payment.set(null);
    this.selection.set(null);
    this.errorKey.set(null);
  }

  load(subscription: SubscriptionRecord): Observable<void> {
    this.reset();
    this.subscription = subscription;
    if (
      !this.available ||
      subscription.status !== 'approved' ||
      !['payment_pending', 'payment_confirmed', 'issued'].includes(subscription.saga.status)
    ) {
      this.errorKey.set('payment.errors.notAllowed');
      return of(undefined);
    }
    this.loading.set(true);
    return defer(() =>
      forkJoin({
        selection: this.offers.loadSelection(subscription.quoteId),
        payment: this.gateway.load(subscription.quoteId),
      }),
    ).pipe(
      take(1),
      map(({ selection, payment }) => {
        if (
          !selection?.confirmed ||
          selection.quoteId !== subscription.quoteId ||
          selection.offerId !== subscription.offerId ||
          selection.offerVersion !== subscription.offerVersion
        ) {
          throw new Error('The accepted offer does not match the subscription.');
        }
        if (payment) {
          this.validatePayment(payment, subscription, selection);
        } else if (['payment_confirmed', 'issued'].includes(subscription.saga.status)) {
          throw new Error('A confirmed payment could not be recovered.');
        }
        this.selection.set(selection);
        this.payment.set(payment);
      }),
      catchError((error: unknown) => {
        this.errorKey.set(paymentErrorKey(error));
        return of(undefined);
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  confirm(): Observable<SimulatedPaymentRecord | null> {
    if (this.confirming()) {
      return of(null);
    }
    const subscription = this.subscription;
    const selection = this.selection();
    if (!this.canConfirm() || !subscription || !selection) {
      this.errorKey.set('payment.errors.notAllowed');
      return of(null);
    }
    this.confirming.set(true);
    this.errorKey.set(null);
    return defer(() => {
      if (!this.storage) {
        throw new Error('Session storage is required for safe payment retries.');
      }
      const storageKey = `solventa.payment.attempt.${subscription.id}`;
      const key = this.storage.getItem(storageKey) ?? crypto.randomUUID();
      this.storage.setItem(storageKey, key);
      return this.gateway.confirm(subscription.quoteId, key);
    }).pipe(
      take(1),
      map((payment) => {
        this.validatePayment(payment, subscription, selection);
        this.payment.set(payment);
        return payment;
      }),
      catchError((error: unknown) => {
        this.errorKey.set(paymentErrorKey(error));
        return of(null);
      }),
      finalize(() => this.confirming.set(false)),
    );
  }

  private validatePayment(
    payment: SimulatedPaymentRecord,
    subscription: SubscriptionRecord,
    selection: SelectedOfferRecord,
  ): void {
    if (
      payment.quoteId !== subscription.quoteId ||
      payment.subscriptionId !== subscription.id ||
      payment.offerId !== subscription.offerId ||
      payment.offerVersion !== subscription.offerVersion ||
      payment.premium.amount !== selection.premium.amount ||
      payment.premium.currency !== selection.premium.currency ||
      payment.periodicity !== selection.periodicity
    ) {
      throw new Error('The simulated payment does not match the accepted offer.');
    }
  }
}

function paymentErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 401:
        return 'payment.errors.session';
      case 404:
        return 'payment.errors.notFound';
      case 409:
        return 'payment.errors.conflict';
      case 422:
        return 'payment.errors.notAllowed';
    }
  }
  return 'payment.errors.unavailable';
}

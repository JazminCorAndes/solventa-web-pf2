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

type PaymentAttempt =
  | { key: string; outcome: 'unresolved' }
  | { key: string; outcome: 'confirmed' | 'rejected'; paymentId: string };

@Injectable({ providedIn: 'root' })
export class SimulatedPaymentService {
  private readonly gateway = inject(SIMULATED_PAYMENT_GATEWAY);
  private readonly offers = inject(OFFER_GATEWAY);
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private subscription: SubscriptionRecord | null = null;
  private confirmedPayment: { id: string; reference: string; subscriptionId: string } | null = null;

  readonly available = environment.dataAccessMode === 'backend';
  readonly payment = signal<SimulatedPaymentRecord | null>(null);
  readonly selection = signal<SelectedOfferRecord | null>(null);
  readonly loading = signal(false);
  readonly confirming = signal(false);
  readonly errorKey = signal<string | null>(null);
  private readonly attempt = signal<PaymentAttempt | null>(null);
  private readonly recoveryKey = signal<string | null>(null);
  private readonly actionBlocked = computed(
    () =>
      this.loading() ||
      this.confirming() ||
      [
        'payment.errors.notAllowed',
        'payment.errors.notFound',
        'payment.errors.conflict',
        'payment.errors.retryKeyUnavailable',
      ].includes(this.errorKey() ?? ''),
  );
  readonly canConfirm = computed(
    () =>
      !!this.selection() &&
      this.subscription?.saga.status === 'payment_pending' &&
      !this.payment() &&
      !this.actionBlocked(),
  );
  readonly canRetryIssuance = computed(
    () =>
      this.payment()?.status === 'confirmed' &&
      this.subscription?.saga.status === 'payment_confirmed' &&
      !!this.recoveryKey() &&
      this.attempt()?.outcome !== 'rejected' &&
      !this.actionBlocked(),
  );
  readonly canRecoverAttempt = computed(
    () =>
      this.payment()?.status === 'rejected' &&
      this.subscription?.saga.status === 'payment_pending' &&
      this.attempt()?.outcome === 'unresolved' &&
      !this.actionBlocked(),
  );
  readonly canStartNewAttempt = computed(
    () =>
      this.payment()?.status === 'rejected' &&
      this.subscription?.saga.status === 'payment_pending' &&
      this.attempt()?.outcome !== 'unresolved' &&
      !this.actionBlocked(),
  );
  readonly unresolvedAttempt = computed(() => this.attempt()?.outcome === 'unresolved');

  reset(): void {
    this.subscription = null;
    this.payment.set(null);
    this.selection.set(null);
    this.errorKey.set(null);
    this.recoveryKey.set(null);
    this.attempt.set(null);
  }

  load(subscription: SubscriptionRecord): Observable<void> {
    this.reset();
    this.subscription = subscription;
    if (this.confirmedPayment?.subscriptionId !== subscription.id) this.confirmedPayment = null;
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
        const attempt = this.readAttempt(subscription.id);
        if (!payment && (this.confirmedPayment || attempt?.outcome === 'confirmed')) {
          throw new PaymentConflictError('A known confirmed payment could not be recovered.');
        }
        if (
          this.conflictsWithConfirmed(payment) ||
          (payment?.status === 'confirmed' &&
            attempt?.outcome === 'confirmed' &&
            payment.id !== attempt.paymentId) ||
          (payment?.status === 'rejected' &&
            (attempt?.outcome === 'confirmed' || subscription.saga.status !== 'payment_pending'))
        ) {
          throw new PaymentConflictError('The payment conflicts with a known confirmation.');
        }
        this.attempt.set(attempt);
        this.selection.set(selection);
        this.payment.set(payment);
        this.rememberConfirmed(payment);
        if (payment?.status === 'confirmed' && subscription.saga.status === 'payment_confirmed') {
          if (attempt && attempt.outcome !== 'rejected') {
            this.recoveryKey.set(attempt.key);
          } else {
            this.errorKey.set('payment.errors.retryKeyUnavailable');
          }
        }
      }),
      catchError((error: unknown) => {
        this.errorKey.set(paymentErrorKey(error));
        return of(undefined);
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  confirm(): Observable<SimulatedPaymentRecord | null> {
    return this.executeAttempt(false);
  }

  startNewAttempt(): Observable<SimulatedPaymentRecord | null> {
    return this.executeAttempt(true);
  }

  private executeAttempt(newAttempt: boolean): Observable<SimulatedPaymentRecord | null> {
    if (this.confirming()) {
      return of(null);
    }
    const subscription = this.subscription;
    const selection = this.selection();
    const allowed = newAttempt
      ? this.canStartNewAttempt()
      : this.canConfirm() || this.canRetryIssuance() || this.canRecoverAttempt();
    if (!allowed || !subscription || !selection) {
      this.errorKey.set('payment.errors.notAllowed');
      return of(null);
    }
    const recoveredPayment = this.payment();
    const expectedKey = this.attempt()?.key;
    let key: string;
    this.confirming.set(true);
    this.errorKey.set(null);
    return defer(() => {
      if (!this.storage) {
        throw new Error('Session storage is required for safe payment retries.');
      }
      const existing = this.readAttempt(subscription.id);
      if (existing?.key !== expectedKey || (newAttempt && existing?.outcome === 'unresolved')) {
        this.recoveryKey.set(null);
        throw new PaymentAttemptUnavailableError(
          'The original payment attempt key is unavailable.',
        );
      }
      key = newAttempt ? crypto.randomUUID() : (existing?.key ?? crypto.randomUUID());
      this.saveAttempt(subscription.id, { key, outcome: 'unresolved' });
      return this.gateway.confirm(subscription.quoteId, key);
    }).pipe(
      take(1),
      map((payment) => {
        this.validatePayment(payment, subscription, selection);
        if (this.subscription?.id !== subscription.id) {
          throw new PaymentConflictError('The active subscription changed.');
        }
        if (this.readAttempt(subscription.id)?.key !== key) {
          throw new PaymentAttemptUnavailableError(
            'The original attempt key changed during the request.',
          );
        }
        const current = this.payment();
        const confirmed =
          current?.status === 'confirmed'
            ? current
            : recoveredPayment?.status === 'confirmed'
              ? recoveredPayment
              : null;
        if (
          this.conflictsWithConfirmed(payment) ||
          (confirmed &&
            (payment.status !== 'confirmed' ||
              payment.id !== confirmed.id ||
              payment.reference !== confirmed.reference))
        ) {
          if (payment.status === 'rejected') {
            this.saveAttempt(subscription.id, { key, outcome: 'rejected', paymentId: payment.id });
          }
          throw new PaymentConflictError('The confirmed payment changed during recovery.');
        }
        this.saveAttempt(subscription.id, { key, outcome: payment.status, paymentId: payment.id });
        this.rememberConfirmed(payment);
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

  private conflictsWithConfirmed(payment: SimulatedPaymentRecord | null): boolean {
    return (
      !!this.confirmedPayment &&
      !!payment &&
      (payment.status !== 'confirmed' ||
        payment.id !== this.confirmedPayment.id ||
        payment.reference !== this.confirmedPayment.reference)
    );
  }

  private rememberConfirmed(payment: SimulatedPaymentRecord | null): void {
    if (payment?.status === 'confirmed') {
      this.confirmedPayment = {
        id: payment.id,
        reference: payment.reference,
        subscriptionId: payment.subscriptionId,
      };
    }
  }

  private readAttempt(subscriptionId: string): PaymentAttempt | null {
    const key = this.storage?.getItem(`solventa.payment.attempt.${subscriptionId}`);
    const receipt = this.storage?.getItem(`solventa.payment.receipt.${subscriptionId}`);
    if (!receipt) return key ? { key, outcome: 'unresolved' } : null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(receipt);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new PaymentAttemptUnavailableError('The payment attempt receipt is invalid.');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('key' in parsed) ||
      !key ||
      parsed.key !== key ||
      !('outcome' in parsed)
    ) {
      throw new PaymentAttemptUnavailableError('The original payment attempt cannot be verified.');
    }
    if (parsed.outcome === 'unresolved') return { key, outcome: 'unresolved' };
    if (
      (parsed.outcome === 'confirmed' || parsed.outcome === 'rejected') &&
      'paymentId' in parsed &&
      typeof parsed.paymentId === 'string' &&
      parsed.paymentId
    ) {
      return { key, outcome: parsed.outcome, paymentId: parsed.paymentId };
    }
    throw new PaymentAttemptUnavailableError('The payment attempt receipt is invalid.');
  }

  private saveAttempt(subscriptionId: string, attempt: PaymentAttempt): void {
    if (!this.storage) throw new PaymentAttemptUnavailableError('Session storage is required.');
    if (attempt.outcome === 'unresolved') this.attempt.set(attempt);
    // Store the receipt first: an interrupted key rotation must block, not invent another attempt.
    this.storage.setItem(`solventa.payment.receipt.${subscriptionId}`, JSON.stringify(attempt));
    this.storage.setItem(`solventa.payment.attempt.${subscriptionId}`, attempt.key);
    this.attempt.set(attempt);
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

class PaymentAttemptUnavailableError extends Error {}
class PaymentConflictError extends Error {}

function paymentErrorKey(error: unknown): string {
  if (error instanceof PaymentConflictError) {
    return 'payment.errors.conflict';
  }
  if (error instanceof PaymentAttemptUnavailableError) {
    return 'payment.errors.retryKeyUnavailable';
  }
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

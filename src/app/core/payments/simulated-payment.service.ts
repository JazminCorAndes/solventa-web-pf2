import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import {
  catchError,
  defaultIfEmpty,
  defer,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  Subject,
  take,
  takeUntil,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import { SelectedOfferRecord } from '../offers/offer.models';
import { SubscriptionRecord } from '../subscriptions/subscription.models';
import { SIMULATED_PAYMENT_GATEWAY } from './simulated-payment.gateway';
import { PAYMENT_ATTEMPT_KEY_PATTERN, SimulatedPaymentRecord } from './simulated-payment.models';

type PaymentAttempt = { key: string; previousPaymentId?: string } & (
  | { outcome: 'unresolved'; paymentId?: string }
  | { outcome: 'pending' | 'confirmed' | 'rejected' | 'rival'; paymentId: string }
);

@Injectable({ providedIn: 'root' })
export class SimulatedPaymentService implements OnDestroy {
  private readonly gateway = inject(SIMULATED_PAYMENT_GATEWAY);
  private readonly offers = inject(OFFER_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;
  private readonly cancelled = new Subject<void>();
  private ownerId = this.auth.user()?.id ?? null;
  private subscription: SubscriptionRecord | null = null;
  private confirmedPayment: { id: string; reference: string; subscriptionId: string } | null = null;
  private readonly paymentState = signal<SimulatedPaymentRecord | null>(null);
  private readonly selectionState = signal<SelectedOfferRecord | null>(null);

  readonly available = environment.dataAccessMode === 'backend';
  readonly payment = computed(() => (this.ownsSession() ? this.paymentState() : null));
  readonly selection = computed(() => (this.ownsSession() ? this.selectionState() : null));
  readonly loading = signal(false);
  readonly confirming = signal(false);
  readonly errorKey = signal<string | null>(null);
  private readonly attempt = signal<PaymentAttempt | null>(null);
  private readonly recoveryKey = signal<string | null>(null);
  private readonly actionBlocked = computed(
    () =>
      !this.ownsSession() ||
      this.loading() ||
      this.confirming() ||
      [
        'payment.errors.session',
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
      !this.attempt() &&
      !this.actionBlocked(),
  );
  readonly canRetryIssuance = computed(
    () =>
      this.payment()?.status === 'confirmed' &&
      this.subscription?.saga.status === 'payment_confirmed' &&
      this.attempt()?.outcome === 'confirmed' &&
      !!this.recoveryKey() &&
      !this.actionBlocked(),
  );
  readonly canRecoverAttempt = computed(
    () =>
      !!this.subscription &&
      !!this.selection() &&
      this.unresolvedAttempt() &&
      !this.actionBlocked(),
  );
  readonly canStartNewAttempt = computed(
    () =>
      this.payment()?.status === 'rejected' &&
      this.subscription?.saga.status === 'payment_pending' &&
      !this.unresolvedAttempt() &&
      !this.actionBlocked(),
  );
  readonly unresolvedAttempt = computed(
    () =>
      ['unresolved', 'pending'].includes(this.attempt()?.outcome ?? '') ||
      (this.attempt()?.outcome === 'rival' &&
        (!this.payment() || this.payment()?.status === 'pending')),
  );

  constructor() {
    effect(() => {
      const ownerId = this.auth.user()?.id ?? null;
      if (ownerId !== this.ownerId) {
        untracked(() => {
          this.ownerId = ownerId;
          this.confirmedPayment = null;
          this.reset();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.cancelled.next();
    this.cancelled.complete();
  }

  reset(): void {
    this.cancelled.next();
    this.subscription = null;
    this.paymentState.set(null);
    this.selectionState.set(null);
    this.errorKey.set(null);
    this.recoveryKey.set(null);
    this.attempt.set(null);
    this.loading.set(false);
    this.confirming.set(false);
  }

  load(subscription: SubscriptionRecord): Observable<void> {
    this.reset();
    const ownerId = this.auth.user()?.id ?? null;
    if (ownerId !== this.ownerId) this.confirmedPayment = null;
    this.ownerId = ownerId;
    this.subscription = subscription;
    if (this.confirmedPayment?.subscriptionId !== subscription.id) this.confirmedPayment = null;
    if (!ownerId) {
      this.errorKey.set('payment.errors.session');
      return of(undefined);
    }
    if (
      !this.available ||
      subscription.status !== 'approved' ||
      !['payment_pending', 'payment_confirmed', 'issued'].includes(subscription.saga.status)
    ) {
      this.errorKey.set('payment.errors.notAllowed');
      return of(undefined);
    }
    this.loading.set(true);
    let attempt: PaymentAttempt | null = null;
    let exact = false;
    return defer(() => {
      this.assertScope(subscription, ownerId);
      try {
        attempt = this.readAttempt(subscription);
      } catch (error) {
        if (!(error instanceof PaymentAttemptUnavailableError)) throw error;
        this.errorKey.set('payment.errors.retryKeyUnavailable');
      }
      this.attempt.set(attempt);
      exact = !!attempt && !['rejected', 'rival'].includes(attempt.outcome);
      return forkJoin({
        selection: this.offers.loadSelection(subscription.quoteId),
        payment:
          exact && attempt
            ? this.gateway.load(subscription.quoteId, attempt.key)
            : this.gateway.load(subscription.quoteId),
      });
    }).pipe(
      takeUntil(this.cancelled),
      take(1),
      map(({ selection, payment }) => {
        this.assertScope(subscription, ownerId);
        if (attempt && this.readAttempt(subscription)?.key !== attempt.key) {
          throw new PaymentAttemptUnavailableError('The attempt key changed during recovery.');
        }
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
          if (exact || attempt?.outcome === 'rival') this.validateAttemptPayment(payment, attempt);
        } else if (this.confirmedPayment || attempt) {
          throw new PaymentConflictError('A known payment attempt could not be recovered.');
        } else if (['payment_confirmed', 'issued'].includes(subscription.saga.status)) {
          throw new Error('A confirmed payment could not be recovered.');
        }
        if (
          this.conflictsWithConfirmed(payment) ||
          (payment &&
            payment.status !== 'confirmed' &&
            (attempt?.outcome === 'confirmed' || subscription.saga.status !== 'payment_pending'))
        ) {
          throw new PaymentConflictError('The payment conflicts with a known confirmation.');
        }
        if (exact && attempt && payment) {
          this.saveAttempt(subscription, {
            ...attempt,
            outcome: payment.status,
            paymentId: payment.id,
          });
        }
        this.selectionState.set(selection);
        this.paymentState.set(payment);
        this.rememberConfirmed(payment);
        if (payment?.status === 'confirmed' && subscription.saga.status === 'payment_confirmed') {
          const currentAttempt = this.attempt();
          if (exact && currentAttempt?.outcome === 'confirmed') {
            this.recoveryKey.set(currentAttempt.key);
          } else {
            this.errorKey.set('payment.errors.retryKeyUnavailable');
          }
        } else if (payment?.status === 'pending' && !exact && attempt?.outcome !== 'rival') {
          this.errorKey.set('payment.errors.retryKeyUnavailable');
        }
      }),
      catchError((error: unknown) => {
        this.errorKey.set(paymentErrorKey(error));
        return of(undefined);
      }),
      defaultIfEmpty(undefined),
      finalize(() => this.loading.set(false)),
    );
  }

  confirm(): Observable<SimulatedPaymentRecord | null> {
    if (this.loading() || this.confirming()) return of(null);
    if (this.canRecoverAttempt() && this.subscription) {
      try {
        if (this.readAttempt(this.subscription)?.key !== this.attempt()?.key) {
          throw new PaymentAttemptUnavailableError('The original payment attempt key changed.');
        }
      } catch (error) {
        this.errorKey.set(paymentErrorKey(error));
        return of(null);
      }
      return this.load(this.subscription).pipe(map(() => this.payment()));
    }
    return this.executeAttempt(false);
  }

  startNewAttempt(): Observable<SimulatedPaymentRecord | null> {
    return this.executeAttempt(true);
  }

  private executeAttempt(newAttempt: boolean): Observable<SimulatedPaymentRecord | null> {
    if (this.loading() || this.confirming()) return of(null);
    const subscription = this.subscription;
    const selection = this.selection();
    const ownerId = this.ownerId;
    const allowed = newAttempt
      ? this.canStartNewAttempt()
      : this.canConfirm() || this.canRetryIssuance();
    if (!allowed || !subscription || !selection || !ownerId) {
      this.errorKey.set('payment.errors.notAllowed');
      return of(null);
    }
    const recoveredPayment = this.payment();
    const expectedKey = this.attempt()?.key;
    let submitted: PaymentAttempt | undefined;
    this.confirming.set(true);
    this.errorKey.set(null);
    return defer(() => {
      this.assertScope(subscription, ownerId);
      const existing = this.readAttempt(subscription);
      if (
        existing?.key !== expectedKey ||
        (existing && ['unresolved', 'pending'].includes(existing.outcome))
      ) {
        this.recoveryKey.set(null);
        throw new PaymentAttemptUnavailableError(
          'The original payment attempt key is unavailable.',
        );
      }
      const key = newAttempt ? crypto.randomUUID() : (existing?.key ?? crypto.randomUUID());
      submitted = {
        key,
        outcome: 'unresolved',
        ...(newAttempt && recoveredPayment ? { previousPaymentId: recoveredPayment.id } : {}),
        ...(!newAttempt && recoveredPayment?.status === 'confirmed'
          ? { paymentId: recoveredPayment.id }
          : {}),
      };
      this.saveAttempt(subscription, submitted);
      return this.gateway.confirm(subscription.quoteId, key);
    }).pipe(
      takeUntil(this.cancelled),
      take(1),
      map((payment) => {
        this.assertScope(subscription, ownerId);
        this.validatePayment(payment, subscription, selection);
        if (!submitted || this.readAttempt(subscription)?.key !== submitted.key) {
          throw new PaymentAttemptUnavailableError(
            'The original attempt key changed during the request.',
          );
        }
        this.validateAttemptPayment(payment, submitted);
        if (this.conflictsWithConfirmed(payment)) {
          throw new PaymentConflictError('The confirmed payment changed during recovery.');
        }
        this.saveAttempt(subscription, {
          ...submitted,
          outcome: payment.status,
          paymentId: payment.id,
        });
        this.rememberConfirmed(payment);
        this.paymentState.set(payment);
        return payment;
      }),
      catchError((error: unknown) => {
        const rivalId = paymentInProgressId(error);
        if (rivalId && submitted) {
          try {
            this.assertScope(subscription, ownerId);
            this.saveAttempt(subscription, { ...submitted, outcome: 'rival', paymentId: rivalId });
            this.errorKey.set('payment.errors.inProgress');
          } catch (storageError) {
            this.errorKey.set(paymentErrorKey(storageError));
          }
        } else {
          this.errorKey.set(paymentErrorKey(error));
        }
        return of(null);
      }),
      defaultIfEmpty(null),
      finalize(() => this.confirming.set(false)),
    );
  }

  private ownsSession(): boolean {
    return !!this.ownerId && this.auth.user()?.id === this.ownerId;
  }

  private assertScope(subscription: SubscriptionRecord, ownerId: string): void {
    if (
      !this.ownsSession() ||
      this.ownerId !== ownerId ||
      this.subscription?.id !== subscription.id ||
      this.subscription.quoteId !== subscription.quoteId
    ) {
      throw new PaymentAttemptUnavailableError('The active payment session changed.');
    }
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

  private readAttempt(subscription: SubscriptionRecord): PaymentAttempt | null {
    const key = this.storage?.getItem(`solventa.payment.attempt.${subscription.id}`);
    const receipt = this.storage?.getItem(`solventa.payment.receipt.${subscription.id}`);
    if (!receipt && !key) return null;
    if (!receipt || !key || !PAYMENT_ATTEMPT_KEY_PATTERN.test(key)) {
      throw new PaymentAttemptUnavailableError('The payment attempt cannot be attributed safely.');
    }
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
      parsed.key !== key ||
      !('ownerId' in parsed) ||
      parsed.ownerId !== this.ownerId ||
      !('quoteId' in parsed) ||
      parsed.quoteId !== subscription.quoteId ||
      !('subscriptionId' in parsed) ||
      parsed.subscriptionId !== subscription.id ||
      !('outcome' in parsed)
    ) {
      throw new PaymentAttemptUnavailableError('The original payment attempt cannot be verified.');
    }
    const previousPaymentId = 'previousPaymentId' in parsed ? parsed.previousPaymentId : undefined;
    const paymentId = 'paymentId' in parsed ? parsed.paymentId : undefined;
    if (
      (previousPaymentId !== undefined &&
        (typeof previousPaymentId !== 'string' || !previousPaymentId)) ||
      (paymentId !== undefined && (typeof paymentId !== 'string' || !paymentId))
    ) {
      throw new PaymentAttemptUnavailableError('The payment attempt receipt is invalid.');
    }
    const common = { key, ...(previousPaymentId ? { previousPaymentId } : {}) };
    if (parsed.outcome === 'unresolved') {
      return { ...common, outcome: 'unresolved', ...(paymentId ? { paymentId } : {}) };
    }
    if (
      (parsed.outcome === 'pending' ||
        parsed.outcome === 'confirmed' ||
        parsed.outcome === 'rejected' ||
        parsed.outcome === 'rival') &&
      paymentId
    ) {
      return { ...common, outcome: parsed.outcome, paymentId };
    }
    throw new PaymentAttemptUnavailableError('The payment attempt receipt is invalid.');
  }

  private saveAttempt(subscription: SubscriptionRecord, attempt: PaymentAttempt): void {
    if (!this.storage || !this.ownsSession()) {
      throw new PaymentAttemptUnavailableError(
        'Session storage and the original owner are required.',
      );
    }
    if (attempt.outcome === 'unresolved') this.attempt.set(attempt);
    // An interrupted receipt/key rotation must block, not invent another attempt.
    this.storage.setItem(
      `solventa.payment.receipt.${subscription.id}`,
      JSON.stringify({
        ...attempt,
        ownerId: this.ownerId,
        quoteId: subscription.quoteId,
        subscriptionId: subscription.id,
      }),
    );
    this.storage.setItem(`solventa.payment.attempt.${subscription.id}`, attempt.key);
    this.attempt.set(attempt);
  }

  private validateAttemptPayment(
    payment: SimulatedPaymentRecord,
    attempt: PaymentAttempt | null,
  ): void {
    if (
      attempt &&
      ((attempt.paymentId && payment.id !== attempt.paymentId) ||
        payment.id === attempt.previousPaymentId)
    ) {
      throw new PaymentConflictError(
        'The response does not belong to the reserved payment attempt.',
      );
    }
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

function paymentInProgressId(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) return null;
  const body: unknown = error.error;
  return body !== null &&
    typeof body === 'object' &&
    'code' in body &&
    body.code === 'pago_en_proceso' &&
    'pagoId' in body &&
    typeof body.pagoId === 'string' &&
    body.pagoId.trim().length > 0
    ? body.pagoId
    : null;
}

function paymentErrorKey(error: unknown): string {
  if (error instanceof PaymentConflictError) return 'payment.errors.conflict';
  if (error instanceof PaymentAttemptUnavailableError) return 'payment.errors.retryKeyUnavailable';
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 401:
        return 'payment.errors.session';
      case 403:
        return 'payment.errors.notAllowed';
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

import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { SimulatedPaymentService } from '../../core/payments/simulated-payment.service';
import { SimulatedPaymentRecord } from '../../core/payments/simulated-payment.models';

@Component({
  selector: 'app-subscription-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './subscription-status-page.component.html',
  styleUrl: './subscription-status-page.component.scss',
})
export class SubscriptionStatusPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly detail = this.route.snapshot.data['detail'] === true;
  readonly subscriptions = inject(SubscriptionService);
  readonly payments = inject(SimulatedPaymentService);
  readonly market = ACTIVE_MARKET;
  readonly hasPayment = computed(
    () =>
      ['payment_confirmed', 'issued'].includes(
        this.subscriptions.subscription()?.saga.status ?? '',
      ) || !!this.payments.payment(),
  );
  readonly newAttemptConfirmation = signal<string | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect((onCleanup) => {
      const subscription = this.subscriptions.subscription();
      const unavailable = this.subscriptions.loading() || this.subscriptions.error();
      untracked(() => {
        this.newAttemptConfirmation.set(null);
        this.payments.reset();
        if (
          subscription &&
          !unavailable &&
          subscription.status === 'approved' &&
          ['payment_pending', 'payment_confirmed', 'issued'].includes(subscription.saga.status)
        ) {
          const request = this.payments.load(subscription).subscribe();
          onCleanup(() => request.unsubscribe());
        }
      });
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.subscriptions.load());
  }

  confirmPayment(): void {
    if (
      !this.payments.canConfirm() &&
      !this.payments.canRetryIssuance() &&
      !this.payments.canRecoverAttempt()
    ) {
      return;
    }
    this.handlePayment(this.payments.confirm());
  }

  requestNewAttempt(): void {
    const payment = this.payments.payment();
    if (payment?.status === 'rejected' && this.payments.canStartNewAttempt()) {
      this.newAttemptConfirmation.set(payment.id);
    }
  }

  cancelNewAttempt(): void {
    this.newAttemptConfirmation.set(null);
  }

  confirmNewAttempt(): void {
    const payment = this.payments.payment();
    if (
      !this.newAttemptConfirmation() ||
      this.newAttemptConfirmation() !== payment?.id ||
      !this.payments.canStartNewAttempt()
    )
      return;
    this.newAttemptConfirmation.set(null);
    this.handlePayment(this.payments.startNewAttempt());
  }

  private handlePayment(result: Observable<SimulatedPaymentRecord | null>): void {
    result.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((payment) => {
      if (payment) {
        this.subscriptions.load();
      }
    });
  }
}

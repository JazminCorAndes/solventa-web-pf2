import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { PaymentService } from '../../core/payments/payment.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './payment-page.component.html',
  styleUrl: './payment-page.component.scss',
})
export class PaymentPageComponent {
  readonly offers = inject(OfferSelectionService);
  readonly payments = inject(PaymentService);

  pay(): void {
    if (this.payments.loading() || this.payments.result()) {
      return;
    }
    this.payments
      .pay()
      .pipe(
        take(1),
        finalize(() => this.payments.loading.set(false)),
      )
      .subscribe();
  }
}

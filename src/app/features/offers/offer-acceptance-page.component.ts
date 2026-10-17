import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';

@Component({
  selector: 'app-offer-acceptance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './offer-acceptance-page.component.html',
  styleUrl: './offer-acceptance-page.component.scss',
})
export class OfferAcceptancePageComponent implements OnInit {
  private readonly router = inject(Router);
  readonly offers = inject(OfferSelectionService);
  readonly subscriptions = inject(SubscriptionService);
  readonly quotes = inject(QuoteRequestService);
  readonly user = inject(AuthService).user;
  readonly market = ACTIVE_MARKET;
  readonly accepted = signal(false);
  readonly confirming = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly request = this.quotes.latestRequest;
  readonly selectedOffer = this.offers.selectedOffer;
  readonly confirmed = computed(
    () => this.offers.confirmedSelection()?.offerId === this.selectedOffer()?.id,
  );
  readonly productName = computed(() => {
    const request = this.request();
    return (
      this.quotes.products().find((product) => product.id === request?.productId)?.name ??
      request?.productId
    );
  });
  readonly productDetails = computed(() => {
    const request = this.request();
    return request
      ? Object.entries(request.productData).map(([key, value]) => ({
          labelKey: `quoteRequest.fields.${key}`,
          value:
            key === 'destinationCountryCode'
              ? (this.quotes.travelDestinations().find((destination) => destination.code === value)
                  ?.name ?? value)
              : value,
          isDate: key.toLowerCase().endsWith('date'),
        }))
      : [];
  });

  ngOnInit(): void {
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
    this.offers.load();
  }

  updateConsent(event: MatCheckboxChange): void {
    this.accepted.set(event.checked);
    this.errorKey.set(null);
  }

  confirm(): void {
    if (!this.accepted() || this.confirming() || this.confirmed()) {
      return;
    }

    this.confirming.set(true);
    this.errorKey.set(null);
    this.offers
      .confirmSelected()
      .pipe(
        switchMap(() => this.subscriptions.start()),
        take(1),
        finalize(() => this.confirming.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/app/cotizaciones/suscripcion']),
        error: (error: unknown) => {
          this.errorKey.set(
            error instanceof OfferUnavailableError
              ? 'acceptance.errors.unavailable'
              : 'acceptance.errors.subscription',
          );
        },
      });
  }

  continueWithSubscription(): void {
    if (this.confirming()) {
      return;
    }
    this.confirming.set(true);
    this.errorKey.set(null);
    this.subscriptions
      .start()
      .pipe(
        take(1),
        finalize(() => this.confirming.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/app/cotizaciones/suscripcion']),
        error: () => this.errorKey.set('acceptance.errors.subscription'),
      });
  }
}

import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { defer, finalize, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OfferSelectionChangedError, OfferUnavailableError } from '../../core/offers/offer.errors';
import { OfferSelectionReference } from '../../core/offers/offer.models';
import { OfferSelectionService, sameReference } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';

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
export class OfferAcceptancePageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly consentReference = signal<OfferSelectionReference | null>(null);
  readonly offers = inject(OfferSelectionService);
  readonly subscriptions = inject(SubscriptionService);
  readonly quotes = inject(QuoteRequestService);
  readonly user = inject(AuthService).user;
  readonly market = ACTIVE_MARKET;
  readonly accepted = signal(false);
  readonly confirming = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly flowInvalidated = computed(
    () =>
      this.errorKey() === 'profiling.errors.expired' ||
      this.errorKey() === 'profiling.errors.consent' ||
      this.errorKey() === 'acceptance.errors.unavailable',
  );
  readonly request = this.quotes.latestRequest;
  readonly selectedOffer = this.offers.selectedOffer;
  readonly confirmed = computed(() => {
    const accepted = this.offers.confirmedSelection();
    const offer = this.selectedOffer();
    return (
      !!accepted &&
      !!offer &&
      accepted.offerId === offer.id &&
      accepted.offerVersion === offer.version
    );
  });
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

  constructor() {
    effect(() => {
      const current = this.offers.selectionReference();
      if (this.accepted() && !sameReference(this.consentReference(), current)) {
        untracked(() => this.clearConsent());
      }
    });
  }

  ngOnInit(): void {
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
    this.offers.load();
  }

  updateConsent(event: MatCheckboxChange): void {
    const reference = this.offers.selectionReference();
    this.consentReference.set(event.checked && this.offers.canContinue() ? reference : null);
    this.accepted.set(event.checked && this.consentReference() !== null);
    if (!this.flowInvalidated()) {
      this.errorKey.set(null);
    }
  }

  confirm(): void {
    if (
      !this.accepted() ||
      this.confirming() ||
      this.confirmed() ||
      this.flowInvalidated() ||
      !this.offers.canContinue()
    ) {
      return;
    }

    this.confirming.set(true);
    this.errorKey.set(null);
    defer(() => this.offers.confirmSelected(this.consentReference()))
      .pipe(
        switchMap(() => this.subscriptions.start()),
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.confirming.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/app/cotizaciones/suscripcion']),
        error: (error: unknown) => this.showError(error),
      });
  }

  continueWithSubscription(): void {
    if (!this.confirmed() || this.confirming() || this.flowInvalidated()) {
      return;
    }
    this.confirming.set(true);
    this.errorKey.set(null);
    defer(() => this.offers.requireAcceptedSelection())
      .pipe(
        switchMap(() => this.subscriptions.start()),
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.confirming.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/app/cotizaciones/suscripcion']),
        error: (error: unknown) => this.showError(error),
      });
  }

  ngOnDestroy(): void {
    this.offers.cancelPending();
  }

  private clearConsent(): void {
    this.accepted.set(false);
    this.consentReference.set(null);
  }

  private showError(error: unknown): void {
    this.clearConsent();
    this.errorKey.set(
      profilingErrorKey(error) ??
        (error instanceof OfferSelectionChangedError
          ? 'acceptance.errors.selectionChanged'
          : error instanceof OfferUnavailableError
            ? 'acceptance.errors.unavailable'
            : this.confirmed()
              ? 'acceptance.errors.subscription'
              : 'acceptance.errors.confirmation'),
    );
  }
}

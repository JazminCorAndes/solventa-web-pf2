import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { InsuranceOffer } from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';

@Component({
  selector: 'app-offer-selection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './offer-selection-page.component.html',
  styleUrl: './offer-selection-page.component.scss',
})
export class OfferSelectionPageComponent implements OnInit {
  private readonly router = inject(Router);

  readonly offers = inject(OfferSelectionService);
  readonly market = ACTIVE_MARKET;
  readonly confirming = signal(false);
  readonly confirmationErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.offers.load();
  }

  selectOffer(offer: InsuranceOffer): void {
    this.confirmationErrorKey.set(null);
    this.offers.selectOffer(offer);
  }

  continueToAcceptance(): void {
    if (this.confirming() || !this.offers.canContinue()) {
      return;
    }

    this.confirming.set(true);
    this.confirmationErrorKey.set(null);
    this.offers
      .confirmSelected()
      .pipe(
        take(1),
        finalize(() => this.confirming.set(false)),
      )
      .subscribe({
        next: () => void this.router.navigate(['/app/cotizaciones/aceptacion']),
        error: (error: unknown) => {
          this.confirmationErrorKey.set(
            error instanceof OfferUnavailableError
              ? 'offers.errors.unavailable'
              : 'offers.errors.confirmation',
          );
          this.offers.load();
        },
      });
  }
}

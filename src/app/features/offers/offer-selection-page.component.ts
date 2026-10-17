import { DOCUMENT, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { InsuranceOffer } from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-offer-selection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
    ProfilingPanelComponent,
  ],
  templateUrl: './offer-selection-page.component.html',
  styleUrl: './offer-selection-page.component.scss',
})
export class OfferSelectionPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  readonly offers = inject(OfferSelectionService);
  readonly request = inject(QuoteRequestService).latestRequest;
  readonly profilingReady = signal(false);
  readonly confirming = signal(false);
  readonly confirmationErrorKey = signal<string | null>(null);

  profilingChanged(ready: boolean): void {
    this.profilingReady.set(ready);
    if (ready) {
      this.offers.load();
    }
  }

  selectOffer(offer: InsuranceOffer): void {
    this.confirmationErrorKey.set(null);
    this.offers.selectOffer(offer);
  }

  showOffer(offerId: string): void {
    if (this.offers.expandedOfferId() !== offerId) {
      this.offers.toggleDetails(offerId);
    }
    requestAnimationFrame(() => {
      this.document
        .getElementById(`offer-${offerId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  continueToAcceptance(): void {
    if (this.confirming() || !this.offers.canContinue() || !this.profilingReady()) {
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
            profilingErrorKey(error) ??
              (error instanceof OfferUnavailableError
                ? 'offers.errors.unavailable'
                : 'offers.errors.confirmation'),
          );
          this.offers.load();
        },
      });
  }
}

import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InsuranceOffer } from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-offer-selection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
    ProfilingPanelComponent,
  ],
  templateUrl: './offer-selection-page.component.html',
  styleUrl: './offer-selection-page.component.scss',
})
export class OfferSelectionPageComponent {
  private readonly router = inject(Router);

  readonly offers = inject(OfferSelectionService);
  readonly market = ACTIVE_MARKET;
  readonly request = inject(QuoteRequestService).latestRequest;
  readonly profilingReady = signal(false);

  profilingChanged(ready: boolean): void {
    this.profilingReady.set(ready);
    if (ready) {
      this.offers.load();
    }
  }

  selectOffer(offer: InsuranceOffer): void {
    this.offers.selectOffer(offer);
    void this.router.navigate(['/app/cotizaciones/aceptacion']);
  }
}

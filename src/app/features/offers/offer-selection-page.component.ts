import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { InsuranceOffer } from '../../core/offers/offer.models';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

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
  ],
  templateUrl: './offer-selection-page.component.html',
  styleUrl: './offer-selection-page.component.scss',
})
export class OfferSelectionPageComponent implements OnInit {
  private readonly router = inject(Router);

  readonly offers = inject(OfferSelectionService);
  readonly market = ACTIVE_MARKET;

  ngOnInit(): void {
    this.offers.load();
  }

  selectOffer(offer: InsuranceOffer): void {
    if (this.offers.selectOffer(offer)) {
      void this.router.navigate(['/app/cotizaciones/aceptacion']);
    }
  }
}

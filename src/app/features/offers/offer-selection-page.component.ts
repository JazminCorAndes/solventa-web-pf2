import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { InsuranceOffer, ProvisionalOfferSelection } from '../../core/offers/offer.models';
import { OfferSelectionChangedError, OfferUnavailableError } from '../../core/offers/offer.errors';
import { profilingErrorKey } from '../../core/profiling/profiling.errors';
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
export class OfferSelectionPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly offers = inject(OfferSelectionService);
  readonly market = ACTIVE_MARKET;
  readonly selectionErrorKey = signal<string | null>(null);

  ngOnInit(): void {
    this.offers.load();
  }

  selectOffer(offer: InsuranceOffer): void {
    this.save(this.offers.selectOffer(offer));
  }

  retrySelection(): void {
    this.save(this.offers.retrySelection());
  }

  reload(): void {
    this.selectionErrorKey.set(null);
    this.offers.load();
  }

  ngOnDestroy(): void {
    this.offers.cancelPending();
  }

  private save(request: Observable<ProvisionalOfferSelection>): void {
    this.selectionErrorKey.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(['/app/cotizaciones/aceptacion']),
      error: (error: unknown) =>
        this.selectionErrorKey.set(
          profilingErrorKey(error) ??
            (error instanceof OfferSelectionChangedError
              ? 'offers.errors.selectionChanged'
              : error instanceof OfferUnavailableError
                ? 'offers.errors.unavailable'
                : 'offers.errors.selectionSave'),
        ),
    });
  }
}

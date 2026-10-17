import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-offer-acceptance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  template: `
    <section class="acceptance-page">
      <mat-card appearance="raised">
        <mat-card-content>
          <span class="success-icon"><app-icon name="check" [size]="30" /></span>
          <span class="step">{{ 'acceptance.step' | transloco }}</span>
          <h1>{{ 'acceptance.title' | transloco }}</h1>
          @if (selection.confirmedSelection(); as selected) {
            <div class="selection-summary">
              <span>{{ 'acceptance.selectedOffer' | transloco }}</span>
              <strong>{{ selected.offerName }}</strong>
              <span>
                {{
                  selected.monthlyPremium.amount
                    | currency
                      : selected.monthlyPremium.currency
                      : 'symbol-narrow'
                      : '1.0-0'
                      : market.locale
                }}
              </span>
            </div>
          }
          <p>{{ 'acceptance.body' | transloco }}</p>
          <a mat-stroked-button routerLink="/app/cotizaciones/ofertas">
            ← {{ 'acceptance.backToOffers' | transloco }}
          </a>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: `
    .acceptance-page {
      display: grid;
      min-height: calc(100dvh - 136px);
      place-items: center;
    }

    mat-card {
      width: min(100%, 620px);
      border-top: 2px solid var(--solventa-color-primary);
    }

    mat-card-content {
      padding: var(--solventa-space-8);
      text-align: center;
    }

    .step {
      color: var(--solventa-color-text-secondary);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .success-icon {
      display: grid;
      width: 4rem;
      height: 4rem;
      margin: 0 auto var(--solventa-space-5);
      border-radius: 50%;
      color: var(--solventa-color-success);
      background: var(--solventa-color-success-soft);
      place-items: center;
    }

    h1 {
      margin: var(--solventa-space-3) 0 var(--solventa-space-6);
    }

    .selection-summary {
      display: grid;
      gap: var(--solventa-space-2);
      padding: var(--solventa-space-5);
      border-radius: var(--solventa-radius-md);
      background: var(--solventa-color-surface-muted);
    }

    .selection-summary span {
      color: var(--solventa-color-text-secondary);
    }

    p {
      margin: var(--solventa-space-6) 0;
      color: var(--solventa-color-text-secondary);
    }

    @media (max-width: 600px) {
      .acceptance-page {
        min-height: auto;
        padding: var(--solventa-space-4) 0;
      }

      mat-card-content {
        padding: var(--solventa-space-6) var(--solventa-space-5);
      }
    }
  `,
})
export class OfferAcceptancePageComponent {
  // Trabajo en proceso ... :) Conectar la aceptación formal; esta vista resume la selección.
  readonly selection = inject(OfferSelectionService);
  readonly market = ACTIVE_MARKET;
}

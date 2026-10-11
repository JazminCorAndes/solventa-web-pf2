import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';

@Component({
  selector: 'app-offer-acceptance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  template: `
    <section class="acceptance-page">
      <mat-card appearance="raised">
        <mat-card-content>
          <span class="step">{{ 'acceptance.step' | transloco }}</span>
          <h1>{{ 'acceptance.title' | transloco }}</h1>
          @if (selection.confirmedSelection(); as selected) {
            <div class="selection-summary">
              <span>{{ 'acceptance.selectedOffer' | transloco }}</span>
              <strong>{{ selected.offerName }}</strong>
              <span>UF {{ selected.monthlyPremiumUf | number: '1.2-2' }}</span>
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
  `,
})
export class OfferAcceptancePageComponent {
  readonly selection = inject(OfferSelectionService);
}

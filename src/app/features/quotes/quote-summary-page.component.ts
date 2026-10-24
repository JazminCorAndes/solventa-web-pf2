import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { DASHBOARD_GATEWAY } from '../../core/dashboard/dashboard.gateway';
import { DashboardSnapshot } from '../../core/dashboard/dashboard.models';
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import { quoteProgress } from '../../core/quotes/quote-progress';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-quote-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    TranslocoPipe,
    ProfilingPanelComponent,
  ],
  templateUrl: './quote-summary-page.component.html',
  styleUrl: './quote-summary-page.component.scss',
})
export class QuoteSummaryPageComponent implements OnInit {
  readonly quotes = inject(QuoteRequestService);
  private readonly gateway = inject(QUOTE_REQUEST_GATEWAY);
  private readonly dashboard = inject(DASHBOARD_GATEWAY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly resumeError = inject(ActivatedRoute).snapshot.queryParamMap.get('error');
  readonly resumeErrorKey =
    this.resumeError === 'expired'
      ? 'profiling.errors.expired'
      : this.resumeError === 'consent'
        ? 'profiling.errors.consent'
        : this.resumeError === 'resume'
          ? 'quoteSummary.resumeError'
          : null;
  readonly profileAvailability = signal<Record<string, boolean>>({});
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly cards = signal<
    Array<{ request: QuoteRequestRecord; progress: ReturnType<typeof quoteProgress> }>
  >([]);

  productName(request: QuoteRequestRecord): string {
    return (
      this.quotes.products().find((product) => product.id === request.productId)?.name ??
      request.productId
    );
  }

  productDetails(request: QuoteRequestRecord) {
    return Object.entries(request.productData).map(([key, value]) => ({
      labelKey: `quoteRequest.fields.${key}`,
      valueKey:
        key === 'coverageType'
          ? `quoteRequest.flightCoverages.${value}`
          : key === 'weatherEvent'
            ? `quoteRequest.weatherEvents.${value}`
            : null,
      value:
        key === 'destinationCountryCode'
          ? (this.quotes.travelDestinations().find((destination) => destination.code === value)
              ?.name ?? value)
          : value,
    }));
  }

  ngOnInit(): void {
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.cards.set([]);
    this.profileAvailability.set({});
    this.dashboard
      .load()
      .pipe(
        switchMap((snapshot) => {
          const ids = [
            ...new Set(
              snapshot.quotes.flatMap((quote) => (quote.requestId ? [quote.requestId] : [])),
            ),
          ];
          return (
            ids.length
              ? forkJoin(ids.map((id) => this.gateway.loadRequest(id)))
              : of([] as QuoteRequestRecord[])
          ).pipe(map((requests) => ({ snapshot, requests })));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({
          snapshot,
          requests,
        }: {
          snapshot: DashboardSnapshot;
          requests: QuoteRequestRecord[];
        }) => {
          this.cards.set(
            requests
              .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
              .map((request) => ({ request, progress: quoteProgress(request.id, snapshot) })),
          );
          this.loading.set(false);
        },
        error: (error: unknown) => {
          console.error('Quote history could not be loaded.', error);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  setProfileAvailability(id: string, available: boolean): void {
    this.profileAvailability.update((current) => ({ ...current, [id]: available }));
  }
}

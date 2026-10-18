import { DatePipe } from '@angular/common';
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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
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
  readonly request = this.quotes.latestRequest;
  readonly profilingReady = signal(false);
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
        }))
      : [];
  });

  ngOnInit(): void {
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
  }
}

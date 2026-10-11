import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';

@Component({
  selector: 'app-quote-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  templateUrl: './quote-summary-page.component.html',
  styleUrl: './quote-summary-page.component.scss',
})
export class QuoteSummaryPageComponent implements OnInit {
  readonly quotes = inject(QuoteRequestService);
  readonly request = this.quotes.latestRequest;
  readonly productName = computed(() => {
    const request = this.request();
    return (
      this.quotes.products().find((product) => product.id === request?.productId)?.name ??
      request?.productId
    );
  });

  ngOnInit(): void {
    this.quotes.loadProducts();
  }
}

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { QuoteRequestService } from './quote-request.service';

export const quoteRequestGuard: CanActivateFn = () => {
  const quotes = inject(QuoteRequestService);
  const router = inject(Router);

  return quotes.latestRequest() ? true : router.createUrlTree(['/app/cotizaciones']);
};

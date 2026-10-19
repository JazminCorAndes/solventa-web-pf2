import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import { OFFER_SELECTION_STORAGE } from '../offers/offer-selection-storage.service';
import { SUBSCRIPTION_GATEWAY } from '../subscriptions/subscription.gateway';
import { SUBSCRIPTION_STORAGE } from '../subscriptions/subscription-storage.service';
import { QUOTE_REQUEST_GATEWAY } from './quote-request.gateway';
import { QuoteRequestService } from './quote-request.service';

export const quoteResumeGuard: CanActivateFn = (route) => {
  const id = route.queryParamMap.get('solicitud');
  const quotes = inject(QuoteRequestService);
  const router = inject(Router);
  const selections = inject(OFFER_SELECTION_STORAGE);
  const subscriptions = inject(SUBSCRIPTION_STORAGE);
  const destination = () => {
    const request = quotes.latestRequest();
    if (!request) {
      return router.createUrlTree(['/app/cotizaciones']);
    }
    const path = route.routeConfig?.path ?? '';
    if (path.includes('suscripcion') && subscriptions.read()?.quoteId !== request.id) {
      return router.createUrlTree(['/app/cotizaciones/aceptacion']);
    }
    if (
      !path.endsWith('ofertas') &&
      !path.endsWith('detalle') &&
      selections.read()?.quoteId !== request.id
    ) {
      return router.createUrlTree(['/app/cotizaciones/ofertas']);
    }
    return true;
  };
  if (!id) {
    return destination();
  }
  return forkJoin({
    request: inject(QUOTE_REQUEST_GATEWAY).loadRequest(id),
    selection: inject(OFFER_GATEWAY).loadSelection(id),
    subscription: inject(SUBSCRIPTION_GATEWAY).load(id),
  }).pipe(
    map(({ request, selection, subscription }) => {
      if (
        request.id !== id ||
        (selection && selection.quoteId !== id) ||
        (subscription && subscription.quoteId !== id)
      ) {
        throw new Error('The recovered flow does not match the requested quote.');
      }
      selections.clear();
      subscriptions.clear();
      quotes.activate(request);
      if (selection) {
        selections.write(selection);
      }
      if (subscription) {
        subscriptions.write(subscription);
      }
      return destination();
    }),
    catchError((error: unknown) => {
      console.error('The quote process could not be recovered.', error);
      return of(router.createUrlTree(['/app/cotizaciones'], { queryParams: { error: 'resume' } }));
    }),
  );
};

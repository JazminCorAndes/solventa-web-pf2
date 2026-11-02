import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import { OFFER_SELECTION_STORAGE } from '../offers/offer-selection-storage.service';
import { SUBSCRIPTION_GATEWAY } from '../subscriptions/subscription.gateway';
import { SUBSCRIPTION_STORAGE } from '../subscriptions/subscription-storage.service';
import { QUOTE_REQUEST_GATEWAY } from './quote-request.gateway';
import { QuoteRequestService } from './quote-request.service';
import { PROFILING_GATEWAY } from '../profiling/profiling.gateway';
import { ProfilingClock } from '../profiling/profiling-clock.service';
import { ProfilingError, profilingErrorKey } from '../profiling/profiling.errors';
import { consentIsCurrent, profileIsCurrent } from '../profiling/profiling.models';

export const quoteResumeGuard: CanActivateFn = (route) => {
  const id = route.queryParamMap.get('solicitud');
  const quotes = inject(QuoteRequestService);
  const router = inject(Router);
  const selections = inject(OFFER_SELECTION_STORAGE);
  const subscriptions = inject(SUBSCRIPTION_STORAGE);
  const profiling = inject(PROFILING_GATEWAY);
  const clock = inject(ProfilingClock);
  const offers = inject(OFFER_GATEWAY);
  const path = route.routeConfig?.path ?? '';
  const subscriptionRoute = path.includes('suscripcion');
  const recoverError = (error: unknown) => {
    console.error('The quote process could not be recovered.', error);
    const key = profilingErrorKey(error);
    return of(
      router.createUrlTree(['/app/cotizaciones'], {
        queryParams: {
          error:
            key === 'profiling.errors.expired'
              ? 'expired'
              : key === 'profiling.errors.consent'
                ? 'consent'
                : 'resume',
        },
      }),
    );
  };
  const validateProfile = (requestId: string) =>
    profiling.loadConsent().pipe(
      switchMap((consent) => {
        if (!consentIsCurrent(consent, clock.now())) {
          throw new ProfilingError('consentimiento_no_vigente');
        }
        return profiling.loadProfile(requestId).pipe(
          map((profile) => {
            if (
              Date.parse(profile.vigenteHasta) <= clock.now() ||
              profile.fuentes?.some((source) => Date.parse(source.vigenteHasta) <= clock.now())
            ) {
              throw new ProfilingError('perfil_vencido');
            }
            if (!profileIsCurrent(profile, consent, requestId, clock.now())) {
              throw new ProfilingError('respuesta_invalida');
            }
            return true as const;
          }),
        );
      }),
    );
  const destination = () => {
    const request = quotes.latestRequest();
    if (!request) {
      return router.createUrlTree(['/app/cotizaciones']);
    }
    if (subscriptionRoute && subscriptions.read()?.quoteId !== request.id) {
      return router.createUrlTree(['/app/cotizaciones/aceptacion']);
    }
    if (
      !path.endsWith('ofertas') &&
      !subscriptionRoute &&
      selections.read()?.quoteId !== request.id
    ) {
      return router.createUrlTree(['/app/cotizaciones/ofertas']);
    }
    return true;
  };
  if (!id) {
    const next = destination();
    const requestId = quotes.latestRequest()?.id;
    const selection = selections.read();
    if (
      next !== true ||
      !requestId ||
      subscriptionRoute ||
      (selection?.quoteId === requestId && selection.confirmed)
    ) {
      return next;
    }
    return validateProfile(requestId).pipe(catchError(recoverError));
  }
  return forkJoin({
    request: inject(QUOTE_REQUEST_GATEWAY).loadRequest(id),
    subscription: inject(SUBSCRIPTION_GATEWAY).load(id),
  }).pipe(
    switchMap(({ request, subscription }) => {
      if (request.id !== id || (subscription && subscription.quoteId !== id)) {
        throw new Error('The recovered flow does not match the requested quote.');
      }
      selections.clear();
      subscriptions.clear();
      quotes.activate(request);
      if (subscription) {
        subscriptions.write(subscription);
        if (subscriptionRoute) {
          return of(destination());
        }
      }
      return offers.loadSelection(id).pipe(
        switchMap((selection) => {
          if (selection && selection.quoteId !== id) {
            throw new Error('The recovered selection does not match the requested quote.');
          }
          if (selection) {
            selections.write(selection);
            return of(destination());
          }
          return validateProfile(id).pipe(map(() => destination()));
        }),
      );
    }),
    catchError(recoverError),
  );
};

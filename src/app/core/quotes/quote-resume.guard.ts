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
import { AuthService } from '../auth/auth.service';
import {
  HttpQuoteHistoryGateway,
  QuoteHistoryEntry,
} from '../../data-access/quotes/http-quote-history.gateway';

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
  const history = inject(HttpQuoteHistoryGateway);
  const user = inject(AuthService).user;
  const owner = user()?.id;
  if (!owner) return router.createUrlTree(['/app/cotizaciones']);
  const historicalDestination = (state: QuoteHistoryEntry) => {
    if (user()?.id !== owner || state.status === 'vencida' || state.status === 'rechazada') {
      selections.clear();
      subscriptions.clear();
      return router.createUrlTree(['/app/cotizaciones']);
    }
    if (state.status === 'completada' && !subscriptionRoute) {
      return router.createUrlTree(['/app/cotizaciones/suscripcion/detalle'], {
        queryParams: { solicitud: state.requestId },
      });
    }
    return null;
  };
  const recoverError = (error: unknown) => {
    console.error('The quote process could not be recovered.', error);
    selections.clear();
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
  const recoverSelection = (requestId: string) =>
    offers.loadSelectionState(requestId).pipe(
      switchMap((state) => {
        if (
          state.quoteId !== requestId ||
          (state.selection && state.selection.quoteId !== requestId) ||
          (state.acceptance && state.acceptance.quoteId !== requestId)
        ) {
          throw new Error('The recovered selection does not match the requested quote.');
        }
        selections.clear();
        const current = state.acceptance ?? state.selection;
        if (current) {
          selections.write(current);
        }
        return state.acceptance
          ? of(destination())
          : validateProfile(requestId).pipe(map(() => destination()));
      }),
    );
  if (!id) {
    const requestId = quotes.latestRequest()?.id;
    if (!requestId) {
      return destination();
    }
    return history.loadClientState(requestId, owner).pipe(
      switchMap((state) => {
        const terminal = historicalDestination(state);
        return terminal
          ? of(terminal)
          : subscriptionRoute
            ? of(destination())
            : recoverSelection(requestId);
      }),
      catchError(recoverError),
    );
  }
  return forkJoin({
    request: inject(QUOTE_REQUEST_GATEWAY).loadRequest(id),
    subscription: inject(SUBSCRIPTION_GATEWAY).load(id),
    state: history.loadClientState(id, owner),
  }).pipe(
    switchMap(({ request, subscription, state }) => {
      if (
        request.id !== id ||
        state.productId !== request.productId ||
        (subscription && subscription.quoteId !== id)
      ) {
        throw new Error('The recovered flow does not match the requested quote.');
      }
      const terminal = historicalDestination(state);
      if (terminal) return of(terminal);
      selections.clear();
      subscriptions.clear();
      quotes.activate(request);
      if (subscription) {
        subscriptions.write(subscription);
        if (subscriptionRoute) {
          return of(destination());
        }
      }
      return recoverSelection(id);
    }),
    catchError(recoverError),
  );
};

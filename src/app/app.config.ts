import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { AUTH_GATEWAY } from './core/auth/auth.gateway';
import { AUTH_STORAGE, BrowserAuthStorage } from './core/auth/auth-storage.service';
import { DASHBOARD_GATEWAY } from './core/dashboard/dashboard.gateway';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { OFFER_GATEWAY } from './core/offers/offer.gateway';
import {
  BrowserOfferSelectionStorage,
  OFFER_SELECTION_STORAGE,
} from './core/offers/offer-selection-storage.service';
import { MockAuthGateway } from './data-access/auth/mock-auth.gateway';
import { HttpAuthGateway } from './data-access/auth/http-auth.gateway';
import { MockDashboardGateway } from './data-access/dashboard/mock-dashboard.gateway';
import { MockOfferGateway } from './data-access/offers/mock-offer.gateway';
import { HttpOfferGateway } from './data-access/offers/http-offer.gateway';
import { SUBSCRIPTION_GATEWAY } from './core/subscriptions/subscription.gateway';
import {
  BrowserSubscriptionStorage,
  SUBSCRIPTION_STORAGE,
} from './core/subscriptions/subscription-storage.service';
import { HttpSubscriptionGateway } from './data-access/subscriptions/http-subscription.gateway';
import { MockSubscriptionGateway } from './data-access/subscriptions/mock-subscription.gateway';
import { QUOTE_REQUEST_GATEWAY } from './core/quotes/quote-request.gateway';
import {
  BrowserQuoteRequestStorage,
  QUOTE_REQUEST_STORAGE,
} from './core/quotes/quote-request-storage.service';
import { MockQuoteRequestGateway } from './data-access/quotes/mock-quote-request.gateway';
import { HttpQuoteRequestGateway } from './data-access/quotes/http-quote-request.gateway';
import { environment } from '../environments/environment';
import { catchError, firstValueFrom, of } from 'rxjs';
import { PROFILING_GATEWAY } from './core/profiling/profiling.gateway';
import { HttpProfilingGateway } from './data-access/profiling/http-profiling.gateway';
import { MockProfilingGateway } from './data-access/profiling/mock-profiling.gateway';

registerLocaleData(localeEsCo);

const backendMode = environment.dataAccessMode === 'backend';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors(backendMode ? [authInterceptor] : [])),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: AUTH_GATEWAY, useClass: backendMode ? HttpAuthGateway : MockAuthGateway },
    { provide: AUTH_STORAGE, useClass: BrowserAuthStorage },
    { provide: DASHBOARD_GATEWAY, useClass: MockDashboardGateway },
    { provide: OFFER_GATEWAY, useClass: backendMode ? HttpOfferGateway : MockOfferGateway },
    { provide: OFFER_SELECTION_STORAGE, useClass: BrowserOfferSelectionStorage },
    {
      provide: SUBSCRIPTION_GATEWAY,
      useClass: backendMode ? HttpSubscriptionGateway : MockSubscriptionGateway,
    },
    { provide: SUBSCRIPTION_STORAGE, useClass: BrowserSubscriptionStorage },
    {
      provide: QUOTE_REQUEST_GATEWAY,
      useClass: backendMode ? HttpQuoteRequestGateway : MockQuoteRequestGateway,
    },
    { provide: QUOTE_REQUEST_STORAGE, useClass: BrowserQuoteRequestStorage },
    MockProfilingGateway,
    {
      provide: PROFILING_GATEWAY,
      ...(backendMode ? { useClass: HttpProfilingGateway } : { useExisting: MockProfilingGateway }),
    },
    provideTransloco({
      config: {
        availableLangs: ['es', 'en'],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    ...(backendMode
      ? [
          provideAppInitializer(() =>
            firstValueFrom(
              inject(AuthService)
                .synchronizeSession()
                .pipe(
                  catchError((error: unknown) => {
                    console.error('The remote session could not be restored.', error);
                    return of(undefined);
                  }),
                ),
            ),
          ),
        ]
      : []),
  ],
};

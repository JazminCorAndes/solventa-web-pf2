import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  isDevMode,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
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
import { MockDashboardGateway } from './data-access/dashboard/mock-dashboard.gateway';
import { MockOfferGateway } from './data-access/offers/mock-offer.gateway';
import { QUOTE_REQUEST_GATEWAY } from './core/quotes/quote-request.gateway';
import {
  BrowserQuoteRequestStorage,
  QUOTE_REQUEST_STORAGE,
} from './core/quotes/quote-request-storage.service';
import { MockQuoteRequestGateway } from './data-access/quotes/mock-quote-request.gateway';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: AUTH_GATEWAY, useClass: MockAuthGateway },
    { provide: AUTH_STORAGE, useClass: BrowserAuthStorage },
    { provide: DASHBOARD_GATEWAY, useClass: MockDashboardGateway },
    { provide: OFFER_GATEWAY, useClass: MockOfferGateway },
    { provide: OFFER_SELECTION_STORAGE, useClass: BrowserOfferSelectionStorage },
    { provide: QUOTE_REQUEST_GATEWAY, useClass: MockQuoteRequestGateway },
    { provide: QUOTE_REQUEST_STORAGE, useClass: BrowserQuoteRequestStorage },
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
  ],
};

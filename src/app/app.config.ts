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
import { MockAuthGateway } from './data-access/auth/mock-auth.gateway';
import { MockDashboardGateway } from './data-access/dashboard/mock-dashboard.gateway';

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

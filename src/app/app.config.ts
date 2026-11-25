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
import { CLAIM_GATEWAY } from './core/claims/claim.gateway';
import { HttpClaimGateway } from './data-access/claims/http-claim.gateway';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { OFFER_GATEWAY } from './core/offers/offer.gateway';
import {
  BrowserOfferSelectionStorage,
  OFFER_SELECTION_STORAGE,
} from './core/offers/offer-selection-storage.service';
import { HttpAuthGateway } from './data-access/auth/http-auth.gateway';
import { HttpDashboardGateway } from './data-access/dashboard/http-dashboard.gateway';
import { HttpOfferGateway } from './data-access/offers/http-offer.gateway';
import { SUBSCRIPTION_GATEWAY } from './core/subscriptions/subscription.gateway';
import {
  BrowserSubscriptionStorage,
  SUBSCRIPTION_STORAGE,
} from './core/subscriptions/subscription-storage.service';
import { HttpSubscriptionGateway } from './data-access/subscriptions/http-subscription.gateway';
import { QUOTE_REQUEST_GATEWAY } from './core/quotes/quote-request.gateway';
import {
  BrowserQuoteRequestStorage,
  QUOTE_REQUEST_STORAGE,
} from './core/quotes/quote-request-storage.service';
import { HttpQuoteRequestGateway } from './data-access/quotes/http-quote-request.gateway';
import { catchError, firstValueFrom, of } from 'rxjs';
import { PROFILING_GATEWAY } from './core/profiling/profiling.gateway';
import { HttpProfilingGateway } from './data-access/profiling/http-profiling.gateway';
import { SIMULATED_PAYMENT_GATEWAY } from './core/payments/simulated-payment.gateway';
import { HttpSimulatedPaymentGateway } from './data-access/payments/http-simulated-payment.gateway';
import { PARTNER_PROFILING_GATEWAY } from './core/advisor-profiling/advisor-profiling.gateway';
import {
  PARTNER_PROFILING_STORAGE,
  BrowserPartnerProfilingStorage,
} from './core/advisor-profiling/advisor-profiling-storage.service';
import { HttpPartnerProfilingGateway } from './data-access/advisor-profiling/http-advisor-profiling.gateway';
import { CLAIM_STATUS_GATEWAY } from './core/claims/claim-status.gateway';
import { HttpClaimStatusGateway } from './data-access/claims/http-claim-status.gateway';
import { CLAIM_EVIDENCE_GATEWAY } from './core/claims/claim-evidence.gateway';
import { HttpClaimEvidenceGateway } from './data-access/claims/http-claim-evidence.gateway';
import { POLICY_RENEWAL_GATEWAY } from './core/policies/policy-renewal.gateway';
import { HttpPolicyRenewalGateway } from './data-access/policies/http-policy-renewal.gateway';
import { POLICY_MODIFICATION_GATEWAY } from './core/policies/policy-modification.gateway';
import { HttpPolicyModificationGateway } from './data-access/policies/http-policy-modification.gateway';
import { POLICY_CANCELLATION_GATEWAY } from './core/policies/policy-cancellation.gateway';
import { HttpPolicyCancellationGateway } from './data-access/policies/http-policy-cancellation.gateway';
import { OPERATIONAL_REPORT_GATEWAY } from './core/reports/operational-report.gateway';
import { HttpOperationalReportGateway } from './data-access/reports/http-operational-report.gateway';
import { ADVISOR_EXCEPTIONS_GATEWAY } from './core/advisor-exceptions/advisor-exceptions.gateway';
import { HttpAdvisorExceptionsGateway } from './data-access/advisor-exceptions/http-advisor-exceptions.gateway';
import { ADMINISTRATION_GATEWAY } from './core/administration/administration.gateway';
import { HttpAdministrationGateway } from './data-access/administration/http-administration.gateway';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    { provide: AUTH_GATEWAY, useClass: HttpAuthGateway },
    { provide: AUTH_STORAGE, useClass: BrowserAuthStorage },
    { provide: ADMINISTRATION_GATEWAY, useClass: HttpAdministrationGateway },
    {
      provide: DASHBOARD_GATEWAY,
      useClass: HttpDashboardGateway,
    },
    {
      provide: CLAIM_STATUS_GATEWAY,
      useClass: HttpClaimStatusGateway,
    },
    {
      provide: CLAIM_EVIDENCE_GATEWAY,
      useClass: HttpClaimEvidenceGateway,
    },
    {
      provide: POLICY_RENEWAL_GATEWAY,
      useClass: HttpPolicyRenewalGateway,
    },
    {
      provide: POLICY_MODIFICATION_GATEWAY,
      useClass: HttpPolicyModificationGateway,
    },
    {
      provide: POLICY_CANCELLATION_GATEWAY,
      useClass: HttpPolicyCancellationGateway,
    },
    {
      provide: OPERATIONAL_REPORT_GATEWAY,
      useClass: HttpOperationalReportGateway,
    },
    {
      provide: CLAIM_GATEWAY,
      useClass: HttpClaimGateway,
    },
    { provide: OFFER_GATEWAY, useClass: HttpOfferGateway },
    { provide: OFFER_SELECTION_STORAGE, useClass: BrowserOfferSelectionStorage },
    {
      provide: SUBSCRIPTION_GATEWAY,
      useClass: HttpSubscriptionGateway,
    },
    { provide: SUBSCRIPTION_STORAGE, useClass: BrowserSubscriptionStorage },
    { provide: SIMULATED_PAYMENT_GATEWAY, useClass: HttpSimulatedPaymentGateway },
    {
      provide: PARTNER_PROFILING_GATEWAY,
      useClass: HttpPartnerProfilingGateway,
    },
    {
      provide: ADVISOR_EXCEPTIONS_GATEWAY,
      useClass: HttpAdvisorExceptionsGateway,
    },
    { provide: PARTNER_PROFILING_STORAGE, useClass: BrowserPartnerProfilingStorage },
    {
      provide: QUOTE_REQUEST_GATEWAY,
      useClass: HttpQuoteRequestGateway,
    },
    { provide: QUOTE_REQUEST_STORAGE, useClass: BrowserQuoteRequestStorage },
    {
      provide: PROFILING_GATEWAY,
      useClass: HttpProfilingGateway,
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
  ],
};

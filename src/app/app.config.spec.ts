import { appConfig } from './app.config';
import { AUTH_GATEWAY } from './core/auth/auth.gateway';
import { ADVISOR_EXCEPTIONS_GATEWAY } from './core/advisor-exceptions/advisor-exceptions.gateway';
import { PARTNER_PROFILING_GATEWAY } from './core/advisor-profiling/advisor-profiling.gateway';
import { CLAIM_GATEWAY } from './core/claims/claim.gateway';
import { CLAIM_STATUS_GATEWAY } from './core/claims/claim-status.gateway';
import { CLAIM_EVIDENCE_GATEWAY } from './core/claims/claim-evidence.gateway';
import { DASHBOARD_GATEWAY } from './core/dashboard/dashboard.gateway';
import { OFFER_GATEWAY } from './core/offers/offer.gateway';
import { POLICY_RENEWAL_GATEWAY } from './core/policies/policy-renewal.gateway';
import { POLICY_MODIFICATION_GATEWAY } from './core/policies/policy-modification.gateway';
import { POLICY_CANCELLATION_GATEWAY } from './core/policies/policy-cancellation.gateway';
import { PROFILING_GATEWAY } from './core/profiling/profiling.gateway';
import { QUOTE_REQUEST_GATEWAY } from './core/quotes/quote-request.gateway';
import { OPERATIONAL_REPORT_GATEWAY } from './core/reports/operational-report.gateway';
import { SUBSCRIPTION_GATEWAY } from './core/subscriptions/subscription.gateway';
import { SIMULATED_PAYMENT_GATEWAY } from './core/payments/simulated-payment.gateway';
import { HttpAuthGateway } from './data-access/auth/http-auth.gateway';
import { HttpAdvisorExceptionsGateway } from './data-access/advisor-exceptions/http-advisor-exceptions.gateway';
import { HttpPartnerProfilingGateway } from './data-access/advisor-profiling/http-advisor-profiling.gateway';
import { HttpClaimGateway } from './data-access/claims/http-claim.gateway';
import { HttpClaimStatusGateway } from './data-access/claims/http-claim-status.gateway';
import { HttpClaimEvidenceGateway } from './data-access/claims/http-claim-evidence.gateway';
import { HttpDashboardGateway } from './data-access/dashboard/http-dashboard.gateway';
import { HttpOfferGateway } from './data-access/offers/http-offer.gateway';
import { HttpPolicyRenewalGateway } from './data-access/policies/http-policy-renewal.gateway';
import { HttpPolicyModificationGateway } from './data-access/policies/http-policy-modification.gateway';
import { HttpPolicyCancellationGateway } from './data-access/policies/http-policy-cancellation.gateway';
import { HttpProfilingGateway } from './data-access/profiling/http-profiling.gateway';
import { HttpQuoteRequestGateway } from './data-access/quotes/http-quote-request.gateway';
import { HttpOperationalReportGateway } from './data-access/reports/http-operational-report.gateway';
import { HttpSubscriptionGateway } from './data-access/subscriptions/http-subscription.gateway';
import { HttpSimulatedPaymentGateway } from './data-access/payments/http-simulated-payment.gateway';

describe('HTTP-only application registration', () => {
  const gateways = [
    [AUTH_GATEWAY, HttpAuthGateway],
    [ADVISOR_EXCEPTIONS_GATEWAY, HttpAdvisorExceptionsGateway],
    [PARTNER_PROFILING_GATEWAY, HttpPartnerProfilingGateway],
    [CLAIM_GATEWAY, HttpClaimGateway],
    [CLAIM_STATUS_GATEWAY, HttpClaimStatusGateway],
    [CLAIM_EVIDENCE_GATEWAY, HttpClaimEvidenceGateway],
    [DASHBOARD_GATEWAY, HttpDashboardGateway],
    [OFFER_GATEWAY, HttpOfferGateway],
    [POLICY_RENEWAL_GATEWAY, HttpPolicyRenewalGateway],
    [POLICY_MODIFICATION_GATEWAY, HttpPolicyModificationGateway],
    [POLICY_CANCELLATION_GATEWAY, HttpPolicyCancellationGateway],
    [PROFILING_GATEWAY, HttpProfilingGateway],
    [QUOTE_REQUEST_GATEWAY, HttpQuoteRequestGateway],
    [OPERATIONAL_REPORT_GATEWAY, HttpOperationalReportGateway],
    [SUBSCRIPTION_GATEWAY, HttpSubscriptionGateway],
    [SIMULATED_PAYMENT_GATEWAY, HttpSimulatedPaymentGateway],
  ] as const;

  it('connects every business gateway to the backend without a mock fallback', () => {
    for (const [token, gateway] of gateways) {
      const providers = appConfig.providers.filter(
        (item) => typeof item === 'object' && 'provide' in item && item.provide === token,
      );
      expect(providers).toEqual([{ provide: token, useClass: gateway }]);
    }
  });
});

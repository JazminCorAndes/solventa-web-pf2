import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import { ADVISOR_PROFILING_GATEWAY } from './core/advisor-profiling/advisor-profiling.gateway';
import { HttpAdvisorProfilingGateway } from './data-access/advisor-profiling/http-advisor-profiling.gateway';
import { MockAdvisorProfilingGateway } from './data-access/advisor-profiling/mock-advisor-profiling.gateway';
import { CLAIM_GATEWAY } from './core/claims/claim.gateway';
import { HttpClaimGateway } from './data-access/claims/http-claim.gateway';
import { MockClaimGateway } from './data-access/claims/mock-claim.gateway';
import { CLAIM_STATUS_GATEWAY } from './core/claims/claim-status.gateway';
import { HttpClaimStatusGateway } from './data-access/claims/http-claim-status.gateway';
import { MockClaimStatusGateway } from './data-access/claims/mock-claim-status.gateway';
import { DASHBOARD_GATEWAY } from './core/dashboard/dashboard.gateway';
import { HttpDashboardGateway } from './data-access/dashboard/http-dashboard.gateway';
import { MockDashboardGateway } from './data-access/dashboard/mock-dashboard.gateway';
import { POLICY_RENEWAL_GATEWAY } from './core/policies/policy-renewal.gateway';
import { HttpPolicyRenewalGateway } from './data-access/policies/http-policy-renewal.gateway';
import { MockPolicyRenewalGateway } from './data-access/policies/mock-policy-renewal.gateway';
import { POLICY_MODIFICATION_GATEWAY } from './core/policies/policy-modification.gateway';
import { HttpPolicyModificationGateway } from './data-access/policies/http-policy-modification.gateway';
import { MockPolicyModificationGateway } from './data-access/policies/mock-policy-modification.gateway';
import { CLAIM_EVIDENCE_GATEWAY } from './core/claims/claim-evidence.gateway';
import { HttpClaimEvidenceGateway } from './data-access/claims/http-claim-evidence.gateway';
import { MockClaimEvidenceGateway } from './data-access/claims/mock-claim-evidence.gateway';

describe('Registro del gateway de perfilamiento hipotecario', () => {
  it('usa gateways simulados para los avances semanales en modo mock', () => {
    const expected = [
      [CLAIM_GATEWAY, HttpClaimGateway, MockClaimGateway],
      [CLAIM_STATUS_GATEWAY, HttpClaimStatusGateway, MockClaimStatusGateway],
      [CLAIM_EVIDENCE_GATEWAY, HttpClaimEvidenceGateway, MockClaimEvidenceGateway],
      [DASHBOARD_GATEWAY, HttpDashboardGateway, MockDashboardGateway],
      [POLICY_RENEWAL_GATEWAY, HttpPolicyRenewalGateway, MockPolicyRenewalGateway],
      [POLICY_MODIFICATION_GATEWAY, HttpPolicyModificationGateway, MockPolicyModificationGateway],
    ] as const;
    for (const [token, http, mock] of expected) {
      const provider = appConfig.providers.find(
        (item) => typeof item === 'object' && 'provide' in item && item.provide === token,
      );
      expect(provider).toEqual({
        provide: token,
        useClass: environment.dataAccessMode === 'backend' ? http : mock,
      });
    }
  });

  it('conserva el gateway HTTP de siniestros en modo backend', () => {
    const provider = appConfig.providers.find(
      (item) => typeof item === 'object' && 'provide' in item && item.provide === CLAIM_GATEWAY,
    );
    expect(provider).toEqual({
      provide: CLAIM_GATEWAY,
      useClass: environment.dataAccessMode === 'backend' ? HttpClaimGateway : MockClaimGateway,
    });
  });

  it('usa solo el gateway correspondiente al modo compilado', () => {
    const provider = appConfig.providers.find(
      (item) =>
        typeof item === 'object' && 'provide' in item && item.provide === ADVISOR_PROFILING_GATEWAY,
    );
    expect(provider).toEqual({
      provide: ADVISOR_PROFILING_GATEWAY,
      useClass:
        environment.dataAccessMode === 'backend'
          ? HttpAdvisorProfilingGateway
          : MockAdvisorProfilingGateway,
    });
  });
});

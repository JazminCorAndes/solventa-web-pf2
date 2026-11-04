import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import { ADVISOR_PROFILING_GATEWAY } from './core/advisor-profiling/advisor-profiling.gateway';
import { HttpAdvisorProfilingGateway } from './data-access/advisor-profiling/http-advisor-profiling.gateway';
import { MockAdvisorProfilingGateway } from './data-access/advisor-profiling/mock-advisor-profiling.gateway';
import { CLAIM_GATEWAY } from './core/claims/claim.gateway';
import { HttpClaimGateway } from './data-access/claims/http-claim.gateway';

describe('Registro del gateway de perfilamiento hipotecario', () => {
  it('mantiene los siniestros conectados al backend sin fallback simulado', () => {
    const provider = appConfig.providers.find(
      (item) => typeof item === 'object' && 'provide' in item && item.provide === CLAIM_GATEWAY,
    );
    expect(provider).toEqual({ provide: CLAIM_GATEWAY, useClass: HttpClaimGateway });
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

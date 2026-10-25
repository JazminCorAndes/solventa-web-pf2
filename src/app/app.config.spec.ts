import { environment } from '../environments/environment';
import { appConfig } from './app.config';
import { ADVISOR_PROFILING_GATEWAY } from './core/advisor-profiling/advisor-profiling.gateway';
import { HttpAdvisorProfilingGateway } from './data-access/advisor-profiling/http-advisor-profiling.gateway';
import { MockAdvisorProfilingGateway } from './data-access/advisor-profiling/mock-advisor-profiling.gateway';

describe('Registro del gateway de perfilamiento hipotecario', () => {
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

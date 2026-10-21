import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { MortgageProfilingRecord, MortgageProfilingRequest } from './advisor-profiling.models';

export interface AdvisorProfilingGateway {
  start(request: MortgageProfilingRequest): Observable<MortgageProfilingRecord>;
}

export const ADVISOR_PROFILING_GATEWAY = new InjectionToken<AdvisorProfilingGateway>(
  'ADVISOR_PROFILING_GATEWAY',
);

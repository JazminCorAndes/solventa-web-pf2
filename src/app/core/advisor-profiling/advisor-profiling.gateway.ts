import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { MortgageProfilingRecord, MortgageProfilingRequest } from './advisor-profiling.models';

export interface PartnerProfilingGateway {
  start(request: MortgageProfilingRequest): Observable<MortgageProfilingRecord>;
}

export const PARTNER_PROFILING_GATEWAY = new InjectionToken<PartnerProfilingGateway>(
  'PARTNER_PROFILING_GATEWAY',
);

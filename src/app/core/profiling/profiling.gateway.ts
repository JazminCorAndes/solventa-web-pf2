import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ConsentDecision, ProfilingConsent, RiskProfile } from './profiling.models';

export interface ProfilingGateway {
  loadConsent(): Observable<ProfilingConsent | null>;
  saveConsent(decision: ConsentDecision): Observable<ProfilingConsent>;
  loadProfile(requestId: string): Observable<RiskProfile>;
}

export const PROFILING_GATEWAY = new InjectionToken<ProfilingGateway>('PROFILING_GATEWAY');

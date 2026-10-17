import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfilingConsent, RiskProfile } from './profiling.models';

export interface ProfilingGateway {
  loadConsent(): Observable<ProfilingConsent | null>;
  saveConsent(authorized: boolean, version: number): Observable<ProfilingConsent>;
  loadProfile(requestId: string): Observable<RiskProfile>;
}

export const PROFILING_GATEWAY = new InjectionToken<ProfilingGateway>('PROFILING_GATEWAY');

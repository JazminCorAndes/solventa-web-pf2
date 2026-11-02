import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdvisorException,
  AdvisorExceptionDecision,
  ResolvedAdvisorException,
} from './advisor-exceptions.models';

export interface AdvisorExceptionsGateway {
  list(socioId: string): Observable<AdvisorException[]>;
  get(excepcionId: string, socioId: string): Observable<AdvisorException>;
  resolve(
    excepcionId: string,
    socioId: string,
    decision: AdvisorExceptionDecision,
    motivo: string,
  ): Observable<ResolvedAdvisorException>;
}

export const ADVISOR_EXCEPTIONS_GATEWAY = new InjectionToken<AdvisorExceptionsGateway>(
  'ADVISOR_EXCEPTIONS_GATEWAY',
);

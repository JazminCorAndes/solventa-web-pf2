import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import {
  AdvisorException,
  AdvisorExceptionError,
  ResolvedAdvisorException,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { AdvisorExceptionsGateway } from '../../core/advisor-exceptions/advisor-exceptions.gateway';

@Injectable()
export class MockAdvisorExceptionsGateway implements AdvisorExceptionsGateway {
  list(): Observable<AdvisorException[]> {
    return of([]);
  }

  get(): Observable<AdvisorException> {
    return throwError(() => new AdvisorExceptionError('excepcion_no_encontrada'));
  }

  resolve(): Observable<ResolvedAdvisorException> {
    return throwError(() => new AdvisorExceptionError('excepcion_no_encontrada'));
  }
}

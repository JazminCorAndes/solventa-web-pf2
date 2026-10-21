import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, OperatorFunction, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProfilingGateway } from '../../core/profiling/profiling.gateway';
import {
  ConsentDecision,
  ProfilingConsent,
  RiskProfile,
} from '../../core/profiling/profiling.models';
import { ProfilingClock } from '../../core/profiling/profiling-clock.service';
import { ProfilingError } from '../../core/profiling/profiling.errors';

@Injectable()
export class HttpProfilingGateway implements ProfilingGateway {
  private readonly http = inject(HttpClient);
  private readonly clock = inject(ProfilingClock);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1`;
  private readonly consentUrl = `${this.baseUrl}/consentimientos/perfilamiento`;

  loadConsent(): Observable<ProfilingConsent | null> {
    const startedAt = performance.now();
    return this.http
      .get<ProfilingConsent>(this.consentUrl, {
        observe: 'response',
      })
      .pipe(
        this.receive<ProfilingConsent>(startedAt),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            const body: unknown = error.error;
            if (
              body &&
              typeof body === 'object' &&
              'code' in body &&
              body.code === 'consentimiento_ausente'
            ) {
              this.clock.synchronize(error.headers.get('Date'), startedAt);
              return of(null);
            }
          }
          return throwError(() => error);
        }),
      );
  }

  saveConsent(decision: ConsentDecision): Observable<ProfilingConsent> {
    const startedAt = performance.now();
    return this.http
      .put<ProfilingConsent>(this.consentUrl, decision, { observe: 'response' })
      .pipe(this.receive<ProfilingConsent>(startedAt));
  }

  loadProfile(requestId: string): Observable<RiskProfile> {
    const startedAt = performance.now();
    return this.http
      .get<RiskProfile>(
        `${this.baseUrl}/solicitudes-cotizacion/${encodeURIComponent(requestId)}/perfilamiento`,
        { observe: 'response' },
      )
      .pipe(this.receive<RiskProfile>(startedAt));
  }

  private receive<T>(startedAt: number): OperatorFunction<HttpResponse<T>, T> {
    return map((response) => {
      this.clock.synchronize(response.headers.get('Date'), startedAt);
      if (response.body === null) {
        throw new ProfilingError('respuesta_invalida');
      }
      return response.body;
    });
  }
}

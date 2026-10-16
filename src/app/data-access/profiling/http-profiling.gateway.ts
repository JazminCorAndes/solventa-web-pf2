import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProfilingGateway } from '../../core/profiling/profiling.gateway';
import { ProfilingConsent, RiskProfile } from '../../core/profiling/profiling.models';

@Injectable()
export class HttpProfilingGateway implements ProfilingGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1`;
  private readonly consentUrl = `${this.baseUrl}/consentimientos/perfilamiento`;

  loadConsent(): Observable<ProfilingConsent | null> {
    return this.http.get<ProfilingConsent>(this.consentUrl, { withCredentials: true }).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          const body: unknown = error.error;
          if (
            body &&
            typeof body === 'object' &&
            'code' in body &&
            body.code === 'consentimiento_ausente'
          ) {
            return of(null);
          }
        }
        return throwError(() => error);
      }),
    );
  }

  saveConsent(authorized: boolean, version: number): Observable<ProfilingConsent> {
    return this.http.put<ProfilingConsent>(
      this.consentUrl,
      { autorizado: authorized, version },
      { withCredentials: true },
    );
  }

  loadProfile(requestId: string): Observable<RiskProfile> {
    return this.http.get<RiskProfile>(
      `${this.baseUrl}/solicitudes-cotizacion/${encodeURIComponent(requestId)}/perfilamiento`,
      { withCredentials: true },
    );
  }
}

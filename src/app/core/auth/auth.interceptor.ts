import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, Observable, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InvalidRefreshTokenError } from './auth.errors';
import { AuthService } from './auth.service';

const PUBLIC_PATHS = ['/v1/sesiones', '/v1/sesiones/renovar', '/v1/usuarios'];

/** Agrega el access token a las llamadas al API y renueva una vez ante un 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isProtectedApiRequest(request)) {
    return next(request);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  const send = (token: string | null): Observable<HttpEvent<unknown>> =>
    next(token ? withBearer(request, token) : request);

  const expireSession = (error: unknown): Observable<never> => {
    auth.invalidateSession();
    void router.navigate(['/iniciar-sesion'], { queryParams: { returnUrl: router.url } });
    return throwError(() => error);
  };

  return auth.getAccessToken().pipe(
    catchError((error: unknown) =>
      error instanceof InvalidRefreshTokenError ? expireSession(error) : throwError(() => error),
    ),
    switchMap((token) =>
      send(token).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          return auth.renewAccessToken(token ?? undefined).pipe(
            switchMap((renewed) => send(renewed)),
            catchError((renewError: unknown) =>
              renewError instanceof InvalidRefreshTokenError ||
              (renewError instanceof HttpErrorResponse && renewError.status === 401)
                ? expireSession(renewError)
                : throwError(() => renewError),
            ),
          );
        }),
      ),
    ),
  );
};

function isProtectedApiRequest(request: HttpRequest<unknown>): boolean {
  const base = environment.apiBaseUrl;
  if (!request.url.startsWith(`${base}/`)) {
    return false;
  }
  const path = request.url.slice(base.length).split('?')[0];
  const isPublic =
    PUBLIC_PATHS.includes(path) && (path !== '/v1/sesiones' || request.method === 'POST');
  return !isPublic;
}

function withBearer<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

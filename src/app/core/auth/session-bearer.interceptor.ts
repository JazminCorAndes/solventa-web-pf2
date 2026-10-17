import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AUTH_STORAGE } from './auth-storage.service';

export const sessionBearerInterceptor: HttpInterceptorFn = (request, next) => {
  const apiUrl = environment.apiBaseUrl.replace(/\/$/, '');
  const loginUrl = `${apiUrl}/v1/sesiones`;
  const path = request.url.split('?')[0];
  if (
    !path.startsWith(`${apiUrl}/`) ||
    (request.method === 'POST' && (path === loginUrl || path === `${loginUrl}/renovar`))
  ) {
    return next(request);
  }

  const session = inject(AUTH_STORAGE).read();
  if (!session?.accessToken || session.expiresAt <= Date.now()) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } }));
};

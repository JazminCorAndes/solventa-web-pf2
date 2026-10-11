import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.hasActiveSession()) {
    return true;
  }

  return inject(Router).createUrlTree(['/iniciar-sesion'], {
    queryParams: { returnUrl: state.url },
  });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasActiveSession() ? inject(Router).createUrlTree(['/app/dashboard']) : true;
};

export function safePostLoginUrl(requestedUrl: string | null): string {
  return requestedUrl?.startsWith('/app') && !requestedUrl.startsWith('//')
    ? requestedUrl
    : '/app/dashboard';
}

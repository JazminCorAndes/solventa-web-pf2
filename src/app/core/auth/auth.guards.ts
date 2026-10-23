import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, map, of } from 'rxjs';
import { AuthUser } from './auth.models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const login = router.createUrlTree(['/iniciar-sesion'], {
    queryParams: { returnUrl: state.url },
  });
  return auth.getAccessToken().pipe(
    map((token) => (token && auth.hasActiveSession() ? true : login)),
    catchError(() => of(router.createUrlTree(['/acceso-no-disponible']))),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasActiveSession() && (auth.session()?.expiresAt ?? 0) > Date.now()
    ? inject(Router).createUrlTree([homeUrl(auth.user())])
    : true;
};

export const portalGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const partnerRoute =
    route.routeConfig?.path === 'socios' || route.routeConfig?.path?.startsWith('socios/');
  return (auth.user()?.role === 'partner') === !!partnerRoute
    ? true
    : inject(Router).createUrlTree([homeUrl(auth.user())]);
};

export function homeUrl(user: AuthUser | null): string {
  return user?.role === 'partner' ? '/app/socios' : '/app/dashboard';
}

export function safePostLoginUrl(
  requestedUrl: string | null,
  user: AuthUser | null = null,
): string {
  const partnerUrl = /^\/app\/socios(?:\/|[?#]|$)/.test(requestedUrl ?? '');
  return requestedUrl?.startsWith('/app/') &&
    !requestedUrl.includes('\\') &&
    (user?.role === 'partner') === partnerUrl
    ? requestedUrl
    : homeUrl(user);
}

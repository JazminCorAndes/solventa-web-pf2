import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import {
  PartnerAccessError,
  PartnerContextService,
  partnerErrorReason,
} from './partner-context.service';

export const partnerGuard: CanActivateFn = (route) => {
  const partners = inject(PartnerContextService);
  const router = inject(Router);
  return partners.load().pipe(
    map((context) => {
      const scope: unknown = route.data['partnerScope'];
      if (typeof scope === 'string' && !context.alcances.includes(scope)) {
        throw new PartnerAccessError('forbidden');
      }
      return true;
    }),
    catchError((error: unknown) => {
      partners.clear();
      return of(
        router.createUrlTree(['/acceso-no-disponible'], {
          queryParams: { reason: partnerErrorReason(error) },
        }),
      );
    }),
  );
};

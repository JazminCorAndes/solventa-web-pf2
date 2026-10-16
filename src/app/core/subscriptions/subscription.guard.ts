import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SUBSCRIPTION_STORAGE } from './subscription-storage.service';

export const subscriptionGuard: CanActivateFn = () =>
  inject(SUBSCRIPTION_STORAGE).read() !== null ||
  inject(Router).createUrlTree(['/app/cotizaciones/aceptacion']);

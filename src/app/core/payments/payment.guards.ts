import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SUBSCRIPTION_STORAGE } from '../subscriptions/subscription-storage.service';
import { PAYMENT_STORAGE } from './payment-storage.service';

export const paymentGuard: CanActivateFn = () =>
  inject(SUBSCRIPTION_STORAGE).read() !== null ||
  inject(Router).createUrlTree(['/app/cotizaciones/aceptacion']);

export const policyGuard: CanActivateFn = () =>
  inject(PAYMENT_STORAGE).read() !== null ||
  inject(Router).createUrlTree(['/app/cotizaciones/suscripcion']);

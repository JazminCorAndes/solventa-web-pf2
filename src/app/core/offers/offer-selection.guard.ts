import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OFFER_SELECTION_STORAGE } from './offer-selection-storage.service';

export const offerSelectionGuard: CanActivateFn = () =>
  inject(OFFER_SELECTION_STORAGE).read() !== null ||
  inject(Router).createUrlTree(['/app/cotizaciones/ofertas']);

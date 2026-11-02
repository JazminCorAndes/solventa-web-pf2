import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { SimulatedPaymentRecord } from './simulated-payment.models';

export interface SimulatedPaymentGateway {
  load(quoteId: string): Observable<SimulatedPaymentRecord | null>;
  confirm(quoteId: string, idempotencyKey: string): Observable<SimulatedPaymentRecord>;
}

export const SIMULATED_PAYMENT_GATEWAY = new InjectionToken<SimulatedPaymentGateway>(
  'SIMULATED_PAYMENT_GATEWAY',
);

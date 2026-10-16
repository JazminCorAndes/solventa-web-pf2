import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { PaymentPolicyRecord } from './payment.models';

export interface PaymentGateway {
  pay(quoteId: string): Observable<PaymentPolicyRecord>;
  loadPolicy(quoteId: string): Observable<PaymentPolicyRecord | null>;
}

export const PAYMENT_GATEWAY = new InjectionToken<PaymentGateway>('PAYMENT_GATEWAY');

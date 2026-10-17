import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { SubscriptionRecord } from './subscription.models';

export interface SubscriptionGateway {
  start(quoteId: string): Observable<SubscriptionRecord>;
  load(quoteId: string): Observable<SubscriptionRecord | null>;
}

export const SUBSCRIPTION_GATEWAY = new InjectionToken<SubscriptionGateway>('SUBSCRIPTION_GATEWAY');

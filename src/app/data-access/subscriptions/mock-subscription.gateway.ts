import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SubscriptionGateway } from '../../core/subscriptions/subscription.gateway';
import { SubscriptionRecord } from '../../core/subscriptions/subscription.models';
import { SUBSCRIPTION_STORAGE } from '../../core/subscriptions/subscription-storage.service';

@Injectable()
export class MockSubscriptionGateway implements SubscriptionGateway {
  private readonly storage = inject(SUBSCRIPTION_STORAGE);

  start(quoteId: string): Observable<SubscriptionRecord> {
    const existing = this.storage.read();
    if (existing?.quoteId === quoteId) {
      return of(existing);
    }
    const now = new Date().toISOString();
    return of({
      id: crypto.randomUUID(),
      quoteId,
      offerId: 'mock-accepted-offer',
      offerVersion: 1,
      status: 'approved',
      ruleVersion: 'suscripcion-automatica-2026.1',
      createdAt: now,
      updatedAt: now,
      decision: {
        result: 'approved',
        ruleVersion: 'suscripcion-automatica-2026.1',
        decisionHash: 'a'.repeat(64),
        decidedAt: now,
      },
      saga: { status: 'payment_pending', version: 1, updatedAt: now },
    });
  }

  load(quoteId: string): Observable<SubscriptionRecord | null> {
    const subscription = this.storage.read();
    return of(subscription?.quoteId === quoteId ? subscription : null);
  }
}

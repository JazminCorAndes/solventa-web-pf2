import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { SubscriptionRecord } from './subscription.models';

const STORAGE_KEY = 'solventa.subscription';

export interface SubscriptionStorage {
  read(): SubscriptionRecord | null;
  write(subscription: SubscriptionRecord): void;
  clear(): void;
}

export const SUBSCRIPTION_STORAGE = new InjectionToken<SubscriptionStorage>('SUBSCRIPTION_STORAGE');

@Injectable()
export class BrowserSubscriptionStorage implements SubscriptionStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): SubscriptionRecord | null {
    const value = this.storage?.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (isSubscription(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Stored subscription could not be parsed.', error);
    }
    this.clear();
    return null;
  }

  write(subscription: SubscriptionRecord): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(subscription));
  }

  clear(): void {
    this.storage?.removeItem(STORAGE_KEY);
  }
}

function isSubscription(value: unknown): value is SubscriptionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<SubscriptionRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.quoteId === 'string' &&
    typeof candidate.offerId === 'string' &&
    typeof candidate.offerVersion === 'number' &&
    Number.isInteger(candidate.offerVersion) &&
    candidate.offerVersion > 0 &&
    isStatus(candidate.status) &&
    typeof candidate.ruleVersion === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    isStatus(candidate.decision?.result) &&
    candidate.decision?.result === candidate.status &&
    typeof candidate.decision?.ruleVersion === 'string' &&
    typeof candidate.decision?.decisionHash === 'string' &&
    /^[0-9a-f]{64}$/i.test(candidate.decision.decisionHash) &&
    typeof candidate.decision?.decidedAt === 'string' &&
    ['payment_pending', 'payment_confirmed', 'issued', 'failed'].some(
      (status) => status === candidate.saga?.status,
    ) &&
    typeof candidate.saga?.version === 'number' &&
    Number.isInteger(candidate.saga.version) &&
    candidate.saga.version > 0 &&
    typeof candidate.saga?.updatedAt === 'string'
  );
}

function isStatus(value: unknown): boolean {
  return value === 'approved' || value === 'review' || value === 'rejected';
}

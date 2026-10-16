import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { PaymentPolicyRecord } from './payment.models';

const STORAGE_KEY = 'solventa.payment-policy';

export interface PaymentStorage {
  read(): PaymentPolicyRecord | null;
  write(record: PaymentPolicyRecord): void;
  clear(): void;
}

export const PAYMENT_STORAGE = new InjectionToken<PaymentStorage>('PAYMENT_STORAGE');

@Injectable()
export class BrowserPaymentStorage implements PaymentStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): PaymentPolicyRecord | null {
    const value = this.storage?.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (isPaymentPolicy(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Stored payment and policy could not be parsed.', error);
    }
    this.clear();
    return null;
  }

  write(record: PaymentPolicyRecord): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(record));
  }

  clear(): void {
    this.storage?.removeItem(STORAGE_KEY);
  }
}

function isPaymentPolicy(value: unknown): value is PaymentPolicyRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<PaymentPolicyRecord>;
  return (
    candidate.payment?.status === 'confirmed' &&
    candidate.policy?.status === 'active' &&
    candidate.saga?.status === 'issued'
  );
}

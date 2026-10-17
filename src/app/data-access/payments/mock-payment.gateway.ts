import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PaymentGateway } from '../../core/payments/payment.gateway';
import { PaymentPolicyRecord } from '../../core/payments/payment.models';
import { PAYMENT_STORAGE } from '../../core/payments/payment-storage.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  private readonly storage = inject(PAYMENT_STORAGE);
  private readonly offers = inject(OFFER_SELECTION_STORAGE);

  pay(): Observable<PaymentPolicyRecord> {
    const existing = this.storage.read();
    if (existing) {
      return of(existing);
    }
    const selection = this.offers.read();
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setFullYear(validUntil.getFullYear() + 1);
    return of({
      payment: {
        id: crypto.randomUUID(),
        status: 'confirmed',
        amount: selection?.monthlyPremium.amount ?? 0,
        currency: selection?.monthlyPremium.currency ?? 'COP',
        method: 'card',
        confirmedAt: now.toISOString(),
        transactionId: crypto.randomUUID(),
        reference: `PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      },
      policy: {
        id: crypto.randomUUID(),
        number: `SOL-${now.getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        status: 'active',
        productId: 'insurance-product',
        monthlyPremium: selection?.monthlyPremium.amount ?? 0,
        currency: selection?.monthlyPremium.currency ?? 'COP',
        validFrom: now.toISOString(),
        validUntil: validUntil.toISOString(),
        issuedAt: now.toISOString(),
      },
      saga: { status: 'issued', version: 3, updatedAt: now.toISOString() },
    });
  }

  loadPolicy(): Observable<PaymentPolicyRecord | null> {
    return of(this.storage.read());
  }
}

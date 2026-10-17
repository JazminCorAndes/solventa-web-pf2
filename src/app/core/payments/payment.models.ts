import { IssuanceSagaStatus } from '../subscriptions/subscription.models';

export interface PaymentPolicyRecord {
  payment: {
    id: string;
    status: 'confirmed';
    amount: number;
    currency: string;
    method: 'card';
    confirmedAt: string;
    transactionId: string;
    reference: string;
  };
  policy: {
    id: string;
    number: string;
    status: 'active';
    productId: string;
    monthlyPremium: number;
    currency: string;
    validFrom: string;
    validUntil: string;
    issuedAt: string;
  };
  saga: {
    status: IssuanceSagaStatus;
    version: number;
    updatedAt: string;
  };
}

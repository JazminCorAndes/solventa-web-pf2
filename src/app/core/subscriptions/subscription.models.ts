export type SubscriptionStatus = 'approved' | 'review' | 'rejected';
export type IssuanceSagaStatus = 'payment_pending' | 'payment_confirmed' | 'issued' | 'failed';

export interface SubscriptionRecord {
  id: string;
  quoteId: string;
  offerId: string;
  offerVersion: number;
  status: SubscriptionStatus;
  ruleVersion: string;
  createdAt: string;
  updatedAt: string;
  decision: {
    result: SubscriptionStatus;
    ruleVersion: string;
    decisionHash: string;
    decidedAt: string;
  };
  saga: {
    status: IssuanceSagaStatus;
    version: number;
    updatedAt: string;
  };
}

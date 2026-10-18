import { Money, PremiumPeriodicity } from '../offers/offer.models';

export interface SimulatedPaymentRecord {
  id: string;
  quoteId: string;
  subscriptionId: string;
  offerId: string;
  offerVersion: number;
  status: 'confirmed';
  simulated: true;
  reference: string;
  premium: Money;
  periodicity: PremiumPeriodicity;
  confirmedAt: string;
  saga: {
    status: 'payment_confirmed';
    version: number;
    updatedAt: string;
  };
}

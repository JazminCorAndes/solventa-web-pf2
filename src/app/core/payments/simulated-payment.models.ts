import { Money, PremiumPeriodicity } from '../offers/offer.models';

export const PAYMENT_ATTEMPT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SimulatedPaymentBase {
  id: string;
  quoteId: string;
  subscriptionId: string;
  offerId: string;
  offerVersion: number;
  simulated: true;
  reference: string;
  premium: Money;
  periodicity: PremiumPeriodicity;
}

export interface ConfirmedSimulatedPayment extends SimulatedPaymentBase {
  status: 'confirmed';
  confirmedAt: string;
  saga: {
    status: 'payment_confirmed';
    version: number;
    updatedAt: string;
  };
}

export interface RejectedSimulatedPayment extends SimulatedPaymentBase {
  status: 'rejected';
  rejectedAt: string;
  reason: 'rechazo_simulado';
  saga: {
    status: 'payment_pending';
    version: number;
    updatedAt: string;
  };
}

export interface PendingSimulatedPayment extends SimulatedPaymentBase {
  status: 'pending';
  createdAt: string;
  code: 'resultado_no_confirmado';
  saga: {
    status: 'payment_pending';
    version: number;
    updatedAt: string;
  };
}

export type SimulatedPaymentRecord =
  ConfirmedSimulatedPayment | RejectedSimulatedPayment | PendingSimulatedPayment;

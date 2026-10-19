import { PremiumPeriodicity } from '../offers/offer.models';

export interface DashboardMoney {
  amount: string;
  currency: string;
}

export interface DashboardQuote {
  id: string;
  requestId: string | null;
  productId: string;
  status: string;
  createdAt: string;
  validUntil: string;
  estimatedPremium: DashboardMoney;
  selection: {
    offerId: string;
    offerName: string;
    premium: DashboardMoney;
    periodicity: PremiumPeriodicity;
    selectedAt: string;
  } | null;
}

export interface DashboardSubscription {
  id: string;
  requestId: string;
  quoteId: string;
  offerId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  saga: { status: string; version: number; updatedAt: string };
}

export interface DashboardPayment {
  id: string;
  requestId: string;
  subscriptionId: string;
  status: 'confirmado';
  simulated: true;
  amount: DashboardMoney;
  periodicity: PremiumPeriodicity;
  confirmedAt: string;
}

export interface DashboardPolicy {
  id: string;
  subscriptionId: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  simulated: true;
}

export interface DashboardSnapshot {
  quotes: DashboardQuote[];
  subscriptions: DashboardSubscription[];
  payments: DashboardPayment[];
  policies: DashboardPolicy[];
  notifications: { availability: 'no_implementado' };
}

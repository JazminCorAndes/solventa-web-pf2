export type OfferStatus = 'available' | 'expired' | 'withdrawn';

export const PREMIUM_PERIODICITIES = ['mensual', 'por_viaje', 'por_vuelo'] as const;
export type PremiumPeriodicity = (typeof PREMIUM_PERIODICITIES)[number];

export interface Money {
  amount: number;
  currency: string;
}

export interface InsuranceOffer {
  id: string;
  version: number;
  name: string;
  description: string;
  premium: Money;
  periodicity: PremiumPeriodicity;
  coverageLabel: string;
  deductibleLabel: string;
  validityLabel: string;
  liabilityLabel: string;
  coverages: string[];
  conditions: string[];
  additionalBenefits: string[];
  recommended: boolean;
  status: OfferStatus;
  validUntil: string;
}

export interface OfferCalculation {
  quoteId: string;
  calculatedAt: string;
  validUntil: string;
  appliedRate: string;
  offers: InsuranceOffer[];
}

export interface SelectedOfferRecord {
  quoteId: string;
  offerId: string;
  offerVersion: number;
  offerName: string;
  premium: Money;
  periodicity: PremiumPeriodicity;
  selectedAt: string;
}

export function isPremiumPeriodicity(value: unknown): value is PremiumPeriodicity {
  return PREMIUM_PERIODICITIES.some((periodicity) => periodicity === value);
}

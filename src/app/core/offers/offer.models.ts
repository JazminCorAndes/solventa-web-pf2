export type OfferStatus = 'available' | 'expired' | 'withdrawn';

export interface InsuranceOffer {
  id: string;
  version: number;
  name: string;
  description: string;
  monthlyPremiumUf: number;
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
  monthlyPremiumUf: number;
  selectedAt: string;
}

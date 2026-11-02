export type OfferStatus = 'available' | 'accepted' | 'expired' | 'withdrawn';

export const PREMIUM_PERIODICITIES = ['mensual', 'por_viaje', 'por_vuelo', 'por_periodo'] as const;
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
  confirmed: boolean;
}

export interface ProvisionalOfferSelection extends SelectedOfferRecord {
  confirmed: false;
  revision: number;
  validUntil: string;
}

export interface OfferSelectionState {
  quoteId: string;
  selection: ProvisionalOfferSelection | null;
  acceptance: SelectedOfferRecord | null;
  offerStatus: OfferStatus | null;
}

export interface OfferSelectionReference {
  quoteId: string;
  offerId: string;
  offerVersion: number;
  revision: number;
}

export interface ProvisionalSelectionRequest {
  quoteId: string;
  offerId: string;
  offerVersion: number;
  expectedRevision: number;
  idempotencyKey: string;
}

export function isProvisionalSelection(
  selection: SelectedOfferRecord,
): selection is ProvisionalOfferSelection {
  return (
    !selection.confirmed &&
    'revision' in selection &&
    typeof selection.revision === 'number' &&
    Number.isSafeInteger(selection.revision) &&
    selection.revision > 0 &&
    'validUntil' in selection &&
    typeof selection.validUntil === 'string' &&
    selection.validUntil.endsWith('Z') &&
    Number.isFinite(Date.parse(selection.validUntil))
  );
}

export function isPremiumPeriodicity(value: unknown): value is PremiumPeriodicity {
  return PREMIUM_PERIODICITIES.some((periodicity) => periodicity === value);
}

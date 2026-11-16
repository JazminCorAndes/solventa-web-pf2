export type NotRenewableReason =
  'producto_no_renovable' | 'poliza_programada' | 'poliza_vencida' | 'fuera_de_ventana';

export type RenewalState = 'pendiente' | 'renovada' | 'rechazada';

export interface Period {
  start: string;
  end: string;
}

export interface RenewalCoverage {
  name: string;
  description: string;
}

export interface RenewalPremium {
  amount: string;
  currency: 'COP';
  frequency: 'mensual';
}

export interface RenewalOffer {
  policyId: string;
  product: string;
  previousEnd: string;
  newPeriod: Period;
  coverages: RenewalCoverage[];
  premium: RenewalPremium;
  conditions: string[];
  requiresPayment: boolean;
  ruleVersion: string;
  conditionsHash: string;
}

export interface Renewal {
  id: string;
  policyId: string;
  state: RenewalState;
  reason: 'pago_rechazado' | null;
  previousEnd: string;
  newPeriod: Period;
  coverages: RenewalCoverage[];
  premium: RenewalPremium;
  conditions: string[];
  conditionsHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalEligibility {
  policyId: string;
  type: string;
  currentPeriod: Period;
  renewable: boolean;
  reason: NotRenewableReason | null;
  window: { from: string; to: string };
  offer: RenewalOffer | null;
  lastAttempt: Renewal | null;
}

/** Resultado de POST: `replayed` indica que la misma clave ya tenia un resultado (HTTP 200). */
export interface RenewalSubmission {
  renewal: Renewal;
  replayed: boolean;
}

export type RenewalErrorKind =
  'not-found' | 'not-renewable' | 'conditions-changed' | 'in-progress' | 'key-conflict';

export class PolicyRenewalError extends Error {
  override readonly name = 'PolicyRenewalError';

  constructor(
    readonly kind: RenewalErrorKind,
    readonly reason: NotRenewableReason | null = null,
    readonly renewalId: string | null = null,
  ) {
    super(`Policy renewal rejected: ${kind}`);
  }
}

export const POLICY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

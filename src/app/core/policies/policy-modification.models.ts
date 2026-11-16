import { Period } from './policy-renewal.models';

export type Plan = 'esencial' | 'integral' | 'premium';

export type NotModifiableReason =
  'producto_no_modificable' | 'poliza_programada' | 'poliza_vencida' | 'fin_de_vigencia';

export interface Money {
  amount: string;
  currency: 'COP';
}

export interface PolicyCoverage {
  code: string;
  name: string;
  description: string;
  optional: boolean;
  included: boolean;
}

export interface PolicyVersion {
  version: number;
  plan: Plan;
  coverages: PolicyCoverage[];
  premium: Money;
  effectiveFrom: string;
  origin: 'emision' | 'modificacion';
  endorsementId: string | null;
  createdAt: string;
}

export interface ModificationOptions {
  plans: { code: Plan; name: string; factor: string }[];
  optionalCoverages: { code: string; name: string; surcharge: Money }[];
}

export interface ModificationState {
  policyId: string;
  type: string;
  period: Period;
  modifiable: boolean;
  reason: NotModifiableReason | null;
  currentVersion: PolicyVersion | null;
  options: ModificationOptions | null;
  history: PolicyVersion[];
}

export interface ModificationProposal {
  baseVersion: number;
  plan: Plan;
  optionalCoverages: string[];
}

export interface ModificationImpact {
  baseVersion: number;
  previousPlan: Plan;
  newPlan: Plan;
  coverages: PolicyCoverage[];
  added: string[];
  removed: string[];
  previousPremium: Money;
  newPremium: Money;
  monthlyDifference: Money;
  proratedAdjustment: Money;
  remainingDays: number;
  effectiveFrom: string;
  period: Period;
  impactHash: string;
}

export interface ModificationResult {
  endorsementId: string;
  policyId: string;
  previousVersion: number;
  newVersion: number;
  version: PolicyVersion;
  impact: ModificationImpact;
  createdAt: string;
}

export type ModificationErrorKind =
  | 'not-found'
  | 'not-modifiable'
  | 'not-allowed'
  | 'no-changes'
  | 'outdated-version'
  | 'impact-changed'
  | 'key-conflict';

export class PolicyModificationError extends Error {
  override readonly name = 'PolicyModificationError';

  constructor(
    readonly kind: ModificationErrorKind,
    readonly reason: NotModifiableReason | null = null,
    readonly field: string | null = null,
  ) {
    super(`Policy modification rejected: ${kind}`);
  }
}

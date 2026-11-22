import { Period } from './policy-renewal.models';

export const CANCELLATION_REASONS = [
  'ya_no_la_necesito',
  'costo',
  'cambio_de_aseguradora',
  'insatisfaccion',
  'otro',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const NOT_CANCELLABLE_REASONS = [
  'producto_no_cancelable',
  'poliza_cancelada',
  'poliza_programada',
  'poliza_vencida',
  'fin_de_vigencia',
  'renovacion_en_curso',
] as const;
export type NotCancellableReason = (typeof NOT_CANCELLABLE_REASONS)[number];

export interface CancellationMoney {
  amount: string;
  currency: 'COP';
}

export interface CancellationSettlement {
  effectiveDate: string;
  coverageEnd: string;
  endedCoverages: { code: string; name: string }[];
  currentPeriod: Period;
  voidedPeriods: (Period & { premium: CancellationMoney })[];
  monthlyPremium: CancellationMoney;
  periodDays: number;
  unusedDays: number;
  proratedRefund: CancellationMoney;
  voidedRefund: CancellationMoney;
  refund: CancellationMoney;
  pendingAmount: CancellationMoney;
  ruleVersion: string;
  settlementHash: string;
}

export interface PolicyCancellation {
  id: string;
  policyId: string;
  state: 'cancelada';
  reason: CancellationReason;
  effectiveDate: string;
  settlement: CancellationSettlement;
  confirmedAt: string;
  simulated: true;
}

export interface CancellationState {
  policyId: string;
  type: string;
  state: 'activa' | 'cancelada';
  period: Period;
  cancellable: boolean;
  reason: NotCancellableReason | null;
  settlement: CancellationSettlement | null;
  cancellation: PolicyCancellation | null;
}

export interface CancellationAttempt {
  key: string;
  reason: CancellationReason;
  settlementHash: string;
}

export type CancellationErrorKind =
  | 'not-found'
  | 'forbidden'
  | 'session'
  | 'invalid-request'
  | 'not-cancellable'
  | 'settlement-changed'
  | 'key-conflict';

export class PolicyCancellationError extends Error {
  override readonly name = 'PolicyCancellationError';

  constructor(readonly kind: CancellationErrorKind) {
    super(`Policy cancellation rejected: ${kind}`);
  }
}

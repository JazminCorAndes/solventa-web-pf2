export const CLAIM_STATES = [
  'reportado',
  'en_evaluacion',
  'en_revision',
  'en_inspeccion',
  'aprobado',
  'rechazado',
  'pagado',
  'cerrado',
] as const;

export type ClaimState = (typeof CLAIM_STATES)[number];
export type ClaimType = 'asistido' | 'parametrico';

export interface ClaimHistoryEntry {
  state: ClaimState;
  description: string;
  occurredAt: string;
}

/** Estado vigente e historial permitido; las transiciones las decide el Backend. */
export interface ClaimStatus {
  id: string;
  policyId: string;
  type: ClaimType | null;
  state: ClaimState;
  description: string;
  occurredAt: string;
  reportedAt: string;
  updatedAt: string;
  history: ClaimHistoryEntry[];
}

export function isClaimState(value: unknown): value is ClaimState {
  return typeof value === 'string' && (CLAIM_STATES as readonly string[]).includes(value);
}

export const CLAIM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

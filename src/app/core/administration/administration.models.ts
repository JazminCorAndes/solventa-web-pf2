import { ClaimEvidence } from '../claims/claim-evidence.models';
import { ClaimRecord } from '../claims/claim.models';
import { ClaimState } from '../claims/claim-status.models';

export const REVIEW_QUEUES = ['revision', 'inspeccion', 'fraude'] as const;
export type ReviewQueue = (typeof REVIEW_QUEUES)[number];
export type ReviewResult = 'aprobado' | 'rechazado' | 'inspeccion';

export interface ReviewAssignment {
  id: string;
  siniestroId: string;
  tipo: 'cola' | 'perito';
  destino: string;
  estado: 'activa' | 'cerrada';
  asignadaEn: string;
  cerradaEn: string | null;
}

export interface ReviewQueueItem extends ReviewAssignment {
  estadoSiniestro: ClaimState;
}

export interface ReviewDecision {
  id: string;
  siniestroId: string;
  operacionId: string;
  origen: 'automatica' | 'humana';
  actor: { tipo: 'sistema' | 'revisor'; id: string | null };
  resultado: ReviewResult | 'revision' | 'bloqueado_fraude';
  estadoAnterior: ClaimState;
  estadoNuevo: ClaimState;
  motivo: string;
  decididaEn: string;
  asignacion: ReviewAssignment | null;
}

export interface ReviewHistory {
  siniestroId: string;
  estado: ClaimState;
  asignacionActiva: ReviewAssignment | null;
  decisiones: ReviewDecision[];
}

export interface AdministrativeClaim {
  siniestro: ClaimRecord;
  evidencias: AdministrativeEvidence[];
}

export interface AdministrativeEvidence extends Omit<ClaimEvidence, 'ubicacion'> {
  autorId: string;
  ubicacion: {
    consentimiento: boolean;
    latitud: number;
    longitud: number;
    fecha: string;
  } | null;
}

export interface ReviewInput {
  resultado: ReviewResult;
  motivo: string;
}

export function isReviewQueue(value: unknown): value is ReviewQueue {
  return REVIEW_QUEUES.some((queue) => queue === value);
}

import { ClaimStatus } from './claim-status.models';

export const CLAIM_ID = '6f1d2c1a-8a52-4b1e-9d0f-3c2b1a0e9f77';
export const POLICY_ID = '0b6a3c5e-2f7d-4a1b-9c8e-7d6f5e4a3b2c';

/** Respuesta del BFF Web segun contracts/openapi/bff-web-v1.yaml (EstadoSiniestro). */
export const CLAIM_STATUS_RESPONSE = {
  id: CLAIM_ID,
  polizaId: POLICY_ID,
  tipo: 'asistido',
  estado: 'en_inspeccion',
  descripcion: 'El caso fue asignado para inspeccion.',
  ocurridoEn: '2026-11-01T13:00:00Z',
  reportadoEn: '2026-11-01T15:00:00Z',
  actualizadoEn: '2026-11-01T18:00:00Z',
  historial: [
    {
      estado: 'reportado',
      descripcion: 'Recibimos el aviso de tu siniestro.',
      ocurridoEn: '2026-11-01T15:00:00Z',
    },
    {
      estado: 'en_evaluacion',
      descripcion: 'Estamos evaluando la informacion del caso.',
      ocurridoEn: '2026-11-01T16:00:00Z',
    },
    {
      estado: 'en_inspeccion',
      descripcion: 'El caso fue asignado para inspeccion.',
      ocurridoEn: '2026-11-01T18:00:00Z',
    },
  ],
};

export const CLAIM_STATUS: ClaimStatus = {
  id: CLAIM_ID,
  policyId: POLICY_ID,
  type: 'asistido',
  state: 'en_inspeccion',
  description: 'El caso fue asignado para inspeccion.',
  occurredAt: '2026-11-01T13:00:00Z',
  reportedAt: '2026-11-01T15:00:00Z',
  updatedAt: '2026-11-01T18:00:00Z',
  history: [
    {
      state: 'reportado',
      description: 'Recibimos el aviso de tu siniestro.',
      occurredAt: '2026-11-01T15:00:00Z',
    },
    {
      state: 'en_evaluacion',
      description: 'Estamos evaluando la informacion del caso.',
      occurredAt: '2026-11-01T16:00:00Z',
    },
    {
      state: 'en_inspeccion',
      description: 'El caso fue asignado para inspeccion.',
      occurredAt: '2026-11-01T18:00:00Z',
    },
  ],
};

export const CLAIM_NOT_FOUND_PROBLEM = {
  type: 'https://api.solventa.co/problems/siniestro_no_encontrado',
  title: 'Siniestro no encontrado',
  status: 404,
  detail: 'El siniestro no existe o no esta disponible para tu cuenta.',
  code: 'siniestro_no_encontrado',
  correlationId: '3f2c1b0a-9e8d-4c7b-a6f5-e4d3c2b1a090',
};

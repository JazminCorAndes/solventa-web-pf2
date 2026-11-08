export const EVIDENCE_MIMES = ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'] as const;
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];

export interface EvidencePolicy {
  maxCantidad: number;
  maxChunkBytes: number;
  maxVideoSeconds: number;
  formatos: Array<{ mimeType: EvidenceMime; maxBytes: number }>;
}

export interface EvidenceUploadBody {
  mimeType: EvidenceMime;
  tamanoBytes: number;
  sha256: string;
}

export interface EvidenceUpload extends EvidenceUploadBody {
  id: string;
  siniestroId: string;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  offset: number;
  evidenciaId: string | null;
}

export interface ClaimEvidence extends EvidenceUploadBody {
  id: string;
  siniestroId: string;
  creadaEn: string;
}

export interface PendingEvidence {
  key: string;
  body: EvidenceUploadBody;
  disposition?: 'local' | 'remote' | 'rejected';
}

export interface EvidenceFile extends PendingEvidence {
  file: File;
  offset: number;
  state: 'selected' | 'uploading' | 'confirmed' | 'error';
  errorKey: string | null;
}

export class EvidenceValidationError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

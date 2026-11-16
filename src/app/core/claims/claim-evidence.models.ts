export const EVIDENCE_MIMES = ['image/jpeg', 'image/png', 'application/pdf', 'video/mp4'] as const;
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];

export interface EvidencePolicy {
  maxCantidad: number;
  maxChunkBytes: number;
  maxVideoSeconds: number;
  formatos: Array<{ mimeType: EvidenceMime; maxBytes: number }>;
}

export interface EvidenceLocation {
  consentimiento: true;
  latitud: number;
  longitud: number;
  fecha: string;
}

export interface EvidenceMetadata {
  fechaCaptura?: string | null;
  ubicacion?: EvidenceLocation | null;
}

export interface EvidenceUploadBody extends EvidenceMetadata {
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
  state: 'selected' | 'uploading' | 'verifying' | 'confirmed' | 'error';
  errorKey: string | null;
  errorParams?: Record<string, string>;
}

export class EvidenceValidationError extends Error {
  constructor(
    readonly key: string,
    readonly params: Record<string, string> = {},
  ) {
    super(key);
  }
}

export function validEvidenceDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19)
  );
}

export function validEvidenceMetadata(value: EvidenceMetadata): boolean {
  const location = value.ubicacion;
  return (
    (value.fechaCaptura == null || validEvidenceDate(value.fechaCaptura)) &&
    (location == null ||
      (typeof location === 'object' &&
        location.consentimiento === true &&
        typeof location.latitud === 'number' &&
        Number.isFinite(location.latitud) &&
        Math.abs(location.latitud) <= 90 &&
        typeof location.longitud === 'number' &&
        Number.isFinite(location.longitud) &&
        Math.abs(location.longitud) <= 180 &&
        validEvidenceDate(location.fecha)))
  );
}

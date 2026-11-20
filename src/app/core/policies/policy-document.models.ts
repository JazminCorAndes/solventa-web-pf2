export const DOCUMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOCUMENT_HASH = /^[0-9a-f]{64}$/;

export interface DocumentMetadata {
  documentoId: string;
  polizaId: string;
  versionPoliza: number | null;
  contenidoHash: string;
  formato: 'html';
  simulada: true;
  aviso: string;
}

export interface DocumentAcceptance extends DocumentMetadata {
  id: string;
  actorId: string;
  aceptadaEn: string;
}

export interface PolicyDocument extends DocumentMetadata {
  contenido: {
    formatoVersion: 1;
    simulada: true;
    aviso: string;
    polizaId: string;
    clienteId: string;
    suscripcionId: string;
    producto: { tipo: string; nombre: string };
    vigencia: { inicio: string; fin: string };
    estado: 'activa' | 'cancelada';
    emitidaEn: string;
    reglaEmision: string;
    version: number | null;
    plan: string | null;
    coberturas: {
      codigo: string;
      nombre: string;
      descripcion: string;
      opcional: boolean;
      incluida: boolean;
    }[];
    prima: { monto: string; moneda: 'COP'; periodicidad: 'mensual' } | null;
    condiciones: string[];
  };
  aceptacionActual: DocumentAcceptance | null;
  historialAceptaciones: DocumentAcceptance[];
}

export interface DocumentAcceptanceBody {
  documentoId: string;
  versionPoliza: number | null;
  contenidoHash: string;
  aceptaSimulacion: true;
}

export interface DocumentAcceptanceAttempt {
  key: string;
  body: DocumentAcceptanceBody;
  conflict: boolean;
}

export function sameDocument(
  left: Pick<DocumentMetadata, 'documentoId' | 'versionPoliza' | 'contenidoHash'>,
  right: DocumentAcceptanceBody | DocumentMetadata,
): boolean {
  return (
    left.documentoId === right.documentoId &&
    left.versionPoliza === right.versionPoliza &&
    left.contenidoHash === right.contenidoHash
  );
}

export type DocumentErrorKind =
  | 'invalid'
  | 'session'
  | 'forbidden'
  | 'notFound'
  | 'invalidRequest'
  | 'outdated'
  | 'keyConflict'
  | 'storage'
  | 'unavailable'
  | 'ambiguous'
  | 'download';

export class PolicyDocumentError extends Error {
  constructor(readonly kind: DocumentErrorKind) {
    super(`Policy document: ${kind}`);
  }
}

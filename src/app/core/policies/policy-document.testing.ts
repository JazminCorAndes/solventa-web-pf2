import { DocumentAcceptance, PolicyDocument } from './policy-document.models';

export const DOCUMENT_POLICY_ID = '10000000-0000-4000-8000-000000000001';
export const DOCUMENT_ACTOR_ID = '20000000-0000-4000-8000-000000000002';
export const DOCUMENT_ID = '30000000-0000-4000-8000-000000000003';
export const DOCUMENT_HTML =
  '<!doctype html><html lang="es"><body>SIMULACIÓN académica</body></html>\n';
const NOTICE =
  'Documento y aceptacion simulados para fines academicos. Sin validez legal; no constituyen firma electronica ni digital.';

export function documentBytes(content = DOCUMENT_HTML): ArrayBuffer {
  return Uint8Array.from(new TextEncoder().encode(content)).buffer;
}

export const POLICY_DOCUMENT: PolicyDocument = {
  documentoId: DOCUMENT_ID,
  polizaId: DOCUMENT_POLICY_ID,
  versionPoliza: 1,
  contenidoHash: 'a'.repeat(64),
  formato: 'html',
  simulada: true,
  aviso: NOTICE,
  contenido: {
    formatoVersion: 1,
    simulada: true,
    aviso: NOTICE,
    polizaId: DOCUMENT_POLICY_ID,
    clienteId: DOCUMENT_ACTOR_ID,
    suscripcionId: '40000000-0000-4000-8000-000000000004',
    producto: { tipo: 'travel', nombre: 'Viaje académico' },
    vigencia: { inicio: '2026-11-01', fin: '2026-11-30' },
    estado: 'activa',
    emitidaEn: '2026-11-01T10:00:00Z',
    reglaEmision: 'regla-academica-v1',
    version: 1,
    plan: 'esencial',
    coberturas: [
      {
        codigo: 'asistencia',
        nombre: 'Asistencia académica',
        descripcion: 'Descripción informada por el servicio',
        opcional: false,
        incluida: true,
      },
    ],
    prima: { monto: '139900', moneda: 'COP', periodicidad: 'mensual' },
    condiciones: ['Sin validez legal.'],
  },
  aceptacionActual: null,
  historialAceptaciones: [],
};

export const DOCUMENT_ACCEPTANCE: DocumentAcceptance = {
  documentoId: DOCUMENT_ID,
  polizaId: DOCUMENT_POLICY_ID,
  versionPoliza: 1,
  contenidoHash: POLICY_DOCUMENT.contenidoHash,
  formato: 'html',
  simulada: true,
  aviso: POLICY_DOCUMENT.aviso,
  id: '50000000-0000-4000-8000-000000000005',
  actorId: DOCUMENT_ACTOR_ID,
  aceptadaEn: '2026-11-19T15:40:00Z',
};

export const ACCEPTED_DOCUMENT: PolicyDocument = {
  ...POLICY_DOCUMENT,
  aceptacionActual: DOCUMENT_ACCEPTANCE,
  historialAceptaciones: [DOCUMENT_ACCEPTANCE],
};

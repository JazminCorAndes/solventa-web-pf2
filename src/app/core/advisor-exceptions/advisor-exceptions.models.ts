export type AdvisorExceptionReason =
  'fuente_no_disponible' | 'fuente_vencida' | 'regla_no_aplicable';

export type AdvisorExceptionStatus = 'pendiente' | 'aprobada' | 'rechazada';
export type AdvisorExceptionDecision = 'aprobar' | 'rechazar';
export type ConsentStatus = 'autorizado' | 'rechazado' | 'revocado' | 'vencido';

export interface ExceptionConsent {
  id: string;
  version: string | number;
  estado: ConsentStatus;
  fuentes: string[];
  datos: string[];
  finalidad: 'cotizacion';
  vigenteHasta: string;
}

export interface ExceptionTrace {
  estadoAnterior: string | null;
  estadoActual: AdvisorExceptionStatus;
  alcance: 'open_finance';
  creadoEn: string;
  correlationId: string;
}

export interface AdvisorException {
  excepcionId: string;
  operationId: string;
  socioId: string;
  clienteId: string;
  codigo: AdvisorExceptionReason;
  motivoBloqueo: string;
  alcance: 'open_finance';
  finalidad: 'cotizacion';
  datos: ['indicador_riesgo'];
  consentimiento: ExceptionConsent;
  estado: AdvisorExceptionStatus;
  estadoAnterior: string | null;
  creadoEn: string;
  correlationId: string;
  trazabilidad: ExceptionTrace;
}

export interface ResolvedAdvisorException extends AdvisorException {
  estado: 'aprobada' | 'rechazada';
  decision: AdvisorExceptionDecision;
  actorId: string;
  resueltaEn: string;
  motivo: string;
}

export type AdvisorExceptionErrorCode =
  | 'sesion_invalida'
  | 'socio_no_autorizado'
  | 'alcance_insuficiente'
  | 'excepcion_no_encontrada'
  | 'excepcion_ya_resuelta'
  | 'solicitud_invalida'
  | 'servicio_no_disponible'
  | 'consentimiento_ausente'
  | 'consentimiento_no_vigente'
  | 'respuesta_invalida';

export class AdvisorExceptionError extends Error {
  constructor(readonly code: AdvisorExceptionErrorCode) {
    super(code);
    this.name = 'AdvisorExceptionError';
  }
}

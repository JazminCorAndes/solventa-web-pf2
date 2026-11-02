export type AdvisorExceptionReason =
  'fuente_no_disponible' | 'fuente_vencida' | 'regla_no_aplicable';

export type AdvisorExceptionStatus = 'pendiente' | 'aprobada' | 'rechazada';
export type AdvisorExceptionDecision = 'aprobar' | 'rechazar';
export type ConsentStatus = 'autorizado' | 'rechazado' | 'revocado' | 'vencido';
export type ExceptionApplicationStatus =
  'esperando_decision' | 'pendiente' | 'completada' | 'bloqueada' | 'detenida';
export type ExceptionApplicationFilter = Exclude<ExceptionApplicationStatus, 'esperando_decision'>;

export interface ExceptionApplication {
  estado: ExceptionApplicationStatus;
  intentos: 0 | 1;
  codigo: string | null;
  actualizadaEn: string;
  acuseId: string | null;
}

export interface ExceptionProcess {
  tipo: 'consulta_informacion_cliente';
  actorSolicitanteId: string;
  productoId: string;
  finalidad: 'cotizacion';
  datosSolicitados: string[];
}

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

interface AdvisorExceptionBase {
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
  estadoAnterior: string | null;
  creadoEn: string;
  correlationId: string;
  trazabilidad: ExceptionTrace;
  proceso: ExceptionProcess | null;
  aplicacion: ExceptionApplication | null;
}

export interface PendingAdvisorException extends AdvisorExceptionBase {
  estado: 'pendiente';
  decision: null;
  actorId: null;
  resueltaEn: null;
  motivo: null;
}

export interface ResolvedAdvisorException extends AdvisorExceptionBase {
  estado: 'aprobada' | 'rechazada';
  decision: AdvisorExceptionDecision;
  actorId: string;
  resueltaEn: string;
  motivo: string;
}

export type AdvisorException = PendingAdvisorException | ResolvedAdvisorException;

export type AdvisorExceptionErrorCode =
  | 'sesion_invalida'
  | 'socio_no_autorizado'
  | 'actor_no_autorizado'
  | 'alcance_insuficiente'
  | 'excepcion_no_encontrada'
  | 'excepcion_ya_resuelta'
  | 'decision_pendiente'
  | 'excepcion_sin_operacion'
  | 'conflicto_idempotencia'
  | 'version_no_soportada'
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

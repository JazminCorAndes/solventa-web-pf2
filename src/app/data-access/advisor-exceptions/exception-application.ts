import {
  AdvisorExceptionStatus,
  ExceptionApplication,
  ExceptionApplicationFilter,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { UUID_PATTERN } from '../quotes/http-partner-quote.gateway';

export function isApplicationFilter(value: unknown): value is ExceptionApplicationFilter {
  return (
    value === 'pendiente' || value === 'bloqueada' || value === 'completada' || value === 'detenida'
  );
}

export function isExceptionApplication(value: unknown): value is ExceptionApplication {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).some(
      (key) => !['estado', 'intentos', 'codigo', 'actualizadaEn', 'acuseId'].includes(key),
    ) ||
    !('estado' in value) ||
    !('intentos' in value) ||
    !('codigo' in value) ||
    !('acuseId' in value) ||
    !('actualizadaEn' in value) ||
    !isIsoDate(value.actualizadaEn)
  )
    return false;

  if (value.estado === 'esperando_decision' || value.estado === 'pendiente') {
    return value.intentos === 0 && value.codigo === null && value.acuseId === null;
  }
  if (!isApplicationFilter(value.estado) || value.estado === 'pendiente') return false;
  return (
    value.intentos === (value.estado === 'detenida' ? 0 : 1) &&
    typeof value.codigo === 'string' &&
    value.codigo.trim().length > 0 &&
    typeof value.acuseId === 'string' &&
    UUID_PATTERN.test(value.acuseId)
  );
}

export function applicationMatchesDecision(
  application: ExceptionApplication,
  decision: AdvisorExceptionStatus,
): boolean {
  if (decision === 'pendiente') return application.estado === 'esperando_decision';
  if (application.estado === 'pendiente') return true;
  return decision === 'rechazada'
    ? application.estado === 'detenida'
    : application.estado === 'completada' || application.estado === 'bloqueada';
}

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function sameInstant(first: string, second: unknown): boolean {
  const fraction = (value: string) =>
    (value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '').replace(/0+$/, '');
  return (
    isIsoDate(second) &&
    Date.parse(first) === Date.parse(second) &&
    fraction(first) === fraction(second)
  );
}

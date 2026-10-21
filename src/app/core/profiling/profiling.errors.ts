import { HttpErrorResponse } from '@angular/common/http';

export class ProfilingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const ERROR_KEYS: Record<string, string> = {
  solicitud_consentimiento_invalida: 'profiling.errors.incompleteRequest',
  consentimiento_ausente: 'profiling.errors.consent',
  consentimiento_no_vigente: 'profiling.errors.consent',
  conflicto_version: 'profiling.errors.conflict',
  perfil_vencido: 'profiling.errors.expired',
  perfilamiento_no_disponible: 'profiling.errors.unavailable',
  identidad_no_coincide: 'profiling.errors.identity',
  identidad_no_validada: 'profiling.errors.identity',
  sesion_ausente: 'profiling.errors.session',
  sesion_invalida: 'profiling.errors.session',
  perfil_no_encontrado: 'profiling.errors.notFound',
  solicitud_no_encontrada: 'profiling.errors.notFound',
  reloj_no_disponible: 'profiling.errors.unavailable',
};

export function profilingErrorKey(error: unknown): string | null {
  if (error instanceof ProfilingError) {
    return ERROR_KEYS[error.code] ?? 'profiling.errors.invalid';
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'profiling.errors.session';
    }
    const body: unknown = error.error;
    if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
      return ERROR_KEYS[body.code] ?? null;
    }
  }
  return null;
}

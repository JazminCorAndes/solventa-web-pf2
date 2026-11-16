import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PolicyRenewalGateway } from '../../core/policies/policy-renewal.gateway';
import {
  NotRenewableReason,
  Period,
  PolicyRenewalError,
  Renewal,
  RenewalCoverage,
  RenewalEligibility,
  RenewalOffer,
  RenewalPremium,
  RenewalSubmission,
} from '../../core/policies/policy-renewal.models';

const REASONS: readonly NotRenewableReason[] = [
  'producto_no_renovable',
  'poliza_programada',
  'poliza_vencida',
  'fuera_de_ventana',
];

@Injectable()
export class HttpPolicyRenewalGateway implements PolicyRenewalGateway {
  private readonly http = inject(HttpClient);

  eligibility(policyId: string): Observable<RenewalEligibility> {
    return this.http.get<unknown>(`${base(policyId)}/renovacion`).pipe(
      map((response) => toEligibility(response, policyId)),
      catchError((error: unknown) => throwError(() => toRenewalError(error))),
    );
  }

  renew(
    policyId: string,
    conditionsHash: string,
    idempotencyKey: string,
  ): Observable<RenewalSubmission> {
    return this.http
      .post<unknown>(
        `${base(policyId)}/renovaciones`,
        { aceptaCondiciones: true, condicionesHash: conditionsHash },
        {
          headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
          observe: 'response',
        },
      )
      .pipe(
        map((response) => {
          const renewal = toRenewal(response.body);
          const expected = response.status === 202 ? 'pendiente' : null;
          if (
            ![200, 201, 202].includes(response.status) ||
            renewal.policyId.toLowerCase() !== policyId.toLowerCase() ||
            renewal.conditionsHash !== conditionsHash ||
            (expected === 'pendiente') !== (renewal.state === 'pendiente')
          ) {
            invalid();
          }
          return { renewal, replayed: response.status === 200 };
        }),
        catchError((error: unknown) => throwError(() => toRenewalError(error))),
      );
  }
}

function base(policyId: string): string {
  return `${environment.apiBaseUrl}/v1/clientes/me/polizas/${encodeURIComponent(policyId)}`;
}

function toRenewalError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const body: unknown = error.error;
  const fields = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = fields['code'];
  if (error.status === 404 && code === 'poliza_no_encontrada') {
    return new PolicyRenewalError('not-found');
  }
  if (error.status === 422 && code === 'poliza_no_renovable') {
    const reason = fields['motivo'];
    return REASONS.includes(reason as NotRenewableReason)
      ? new PolicyRenewalError('not-renewable', reason as NotRenewableReason)
      : error;
  }
  if (error.status === 409 && code === 'condiciones_cambiaron') {
    return new PolicyRenewalError('conditions-changed');
  }
  if (error.status === 409 && code === 'renovacion_en_curso') {
    const renewalId = fields['renovacionId'];
    return new PolicyRenewalError(
      'in-progress',
      null,
      typeof renewalId === 'string' ? renewalId : null,
    );
  }
  if (error.status === 409 && code === 'idempotencia_conflictiva') {
    return new PolicyRenewalError('key-conflict');
  }
  return error;
}

function invalid(): never {
  throw new Error('The policy renewal response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function day(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}

function instant(value: unknown): string {
  const result = text(value);
  return Number.isFinite(Date.parse(result)) && result.includes('T') ? result : invalid();
}

function hash(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : invalid();
}

function list<T>(value: unknown, item: (entry: unknown) => T): T[] {
  return Array.isArray(value) && value.length > 0 ? value.map(item) : invalid();
}

function period(value: unknown, startKey = 'inicio', endKey = 'fin'): Period {
  const fields = record(value);
  const result = { start: day(fields[startKey]), end: day(fields[endKey]) };
  return result.end >= result.start ? result : invalid();
}

function coverage(value: unknown): RenewalCoverage {
  const fields = record(value);
  return { name: text(fields['nombre']), description: text(fields['descripcion']) };
}

function premium(value: unknown): RenewalPremium {
  const fields = record(value);
  const amount = text(fields['monto']);
  if (!/^[1-9]\d{0,15}$/.test(amount) || fields['moneda'] !== 'COP') {
    invalid();
  }
  return fields['periodicidad'] === 'mensual'
    ? { amount, currency: 'COP', frequency: 'mensual' }
    : invalid();
}

function toOffer(value: unknown): RenewalOffer {
  const fields = record(value);
  if (typeof fields['requierePago'] !== 'boolean') {
    invalid();
  }
  return {
    policyId: text(fields['polizaId']),
    product: text(fields['producto']),
    previousEnd: day(fields['finAnterior']),
    newPeriod: period(fields['nuevaVigencia']),
    coverages: list(fields['coberturas'], coverage),
    premium: premium(fields['prima']),
    conditions: list(fields['condiciones'], text),
    requiresPayment: fields['requierePago'],
    ruleVersion: text(fields['reglaVersion']),
    conditionsHash: hash(fields['condicionesHash']),
  };
}

function toRenewal(value: unknown): Renewal {
  const fields = record(value);
  const state = fields['estado'];
  if (state !== 'pendiente' && state !== 'renovada' && state !== 'rechazada') {
    invalid();
  }
  const reason = fields['motivo'];
  if ((state === 'rechazada') !== (reason === 'pago_rechazado') || fields['simulada'] !== true) {
    invalid();
  }
  return {
    id: text(fields['id']),
    policyId: text(fields['polizaId']),
    state,
    reason: state === 'rechazada' ? 'pago_rechazado' : null,
    previousEnd: day(fields['finAnterior']),
    newPeriod: period(fields['nuevaVigencia']),
    coverages: list(fields['coberturas'], coverage),
    premium: premium(fields['prima']),
    conditions: list(fields['condiciones'], text),
    conditionsHash: hash(fields['condicionesHash']),
    createdAt: instant(fields['creadaEn']),
    updatedAt: instant(fields['actualizadaEn']),
  };
}

function toEligibility(value: unknown, requestedId: string): RenewalEligibility {
  const fields = record(value);
  const renewable = fields['renovable'];
  const reason = fields['motivo'];
  if (typeof renewable !== 'boolean') {
    invalid();
  }
  if (reason !== null && !REASONS.includes(reason as NotRenewableReason)) {
    invalid();
  }
  const offer = fields['oferta'] === null ? null : toOffer(fields['oferta']);
  const eligibility: RenewalEligibility = {
    policyId: text(fields['polizaId']),
    type: text(fields['tipo']),
    currentPeriod: period(fields['vigenciaActual']),
    renewable,
    reason: reason as NotRenewableReason | null,
    window: (() => {
      const window = period(fields['ventana'], 'desde', 'hasta');
      return { from: window.start, to: window.end };
    })(),
    offer,
    lastAttempt: fields['ultimoIntento'] === null ? null : toRenewal(fields['ultimoIntento']),
  };
  if (
    eligibility.policyId.toLowerCase() !== requestedId.toLowerCase() ||
    renewable !== (reason === null) ||
    renewable !== (offer !== null)
  ) {
    invalid();
  }
  return eligibility;
}

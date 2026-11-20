import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PolicyCancellationGateway } from '../../core/policies/policy-cancellation.gateway';
import {
  CANCELLATION_REASONS,
  CancellationAttempt,
  CancellationMoney,
  CancellationSettlement,
  CancellationState,
  NOT_CANCELLABLE_REASONS,
  PolicyCancellation,
  PolicyCancellationError,
} from '../../core/policies/policy-cancellation.models';
import { Period, POLICY_ID_PATTERN } from '../../core/policies/policy-renewal.models';

@Injectable()
export class HttpPolicyCancellationGateway implements PolicyCancellationGateway {
  private readonly http = inject(HttpClient);

  state(policyId: string): Observable<CancellationState> {
    return this.http.get<unknown>(`${base(policyId)}/cancelacion`).pipe(
      map((response) => toState(response, policyId)),
      catchError((error: unknown) => throwError(() => toCancellationError(error))),
    );
  }

  cancel(policyId: string, attempt: CancellationAttempt): Observable<PolicyCancellation> {
    return this.http
      .post<unknown>(
        `${base(policyId)}/cancelaciones`,
        {
          confirma: true,
          motivoCancelacion: attempt.reason,
          liquidacionHash: attempt.settlementHash,
        },
        { headers: new HttpHeaders({ 'Idempotency-Key': attempt.key }), observe: 'response' },
      )
      .pipe(
        map((response) => {
          const result = toCancellation(response.body, policyId);
          if (
            ![200, 201].includes(response.status) ||
            result.reason !== attempt.reason ||
            result.settlement.settlementHash !== attempt.settlementHash
          ) {
            invalid();
          }
          return result;
        }),
        catchError((error: unknown) => throwError(() => toCancellationError(error))),
      );
  }
}

function base(policyId: string): string {
  return `${environment.apiBaseUrl}/v1/clientes/me/polizas/${encodeURIComponent(policyId)}`;
}

function toCancellationError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) return error;
  if (error.status === 401) return new PolicyCancellationError('session');
  if (error.status === 403) return new PolicyCancellationError('forbidden');
  const payload: unknown = error.error;
  const fields =
    payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const code = fields['code'];
  if (error.status === 400 && code === 'solicitud_invalida') {
    return new PolicyCancellationError('invalid-request');
  }
  if (error.status === 404 && code === 'poliza_no_encontrada') {
    return new PolicyCancellationError('not-found');
  }
  if (
    error.status === 422 &&
    code === 'poliza_no_cancelable' &&
    NOT_CANCELLABLE_REASONS.some((reason) => reason === fields['motivo'])
  ) {
    return new PolicyCancellationError('not-cancellable');
  }
  if (error.status === 409 && code === 'liquidacion_cambio') {
    return new PolicyCancellationError('settlement-changed');
  }
  if (error.status === 409 && code === 'idempotencia_conflictiva') {
    return new PolicyCancellationError('key-conflict');
  }
  return error;
}

function invalid(): never {
  throw new Error('The policy cancellation response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function id(value: unknown): string {
  return typeof value === 'string' && POLICY_ID_PATTERN.test(value) ? value : invalid();
}

function day(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) &&
    Number.isFinite(Date.parse(result)) &&
    new Date(result).toISOString().slice(0, 10) === result
    ? result
    : invalid();
}

function period(value: unknown): Period {
  const fields = record(value);
  const result = { start: day(fields['inicio']), end: day(fields['fin']) };
  return result.end >= result.start ? result : invalid();
}

function money(value: unknown): CancellationMoney {
  const fields = record(value);
  const amount = text(fields['monto']);
  return /^\d{1,16}$/.test(amount) && fields['moneda'] === 'COP'
    ? { amount, currency: 'COP' }
    : invalid();
}

function integer(value: unknown, minimum: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum
    ? value
    : invalid();
}

function list<T>(value: unknown, item: (entry: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(item) : invalid();
}

function toSettlement(value: unknown): CancellationSettlement {
  const fields = record(value);
  const settlement: CancellationSettlement = {
    effectiveDate: day(fields['fechaEfectiva']),
    coverageEnd: day(fields['finCobertura']),
    endedCoverages: list(fields['coberturasFinalizadas'], (entry) => {
      const coverage = record(entry);
      return { code: text(coverage['codigo']), name: text(coverage['nombre']) };
    }),
    currentPeriod: period(fields['periodoActual']),
    voidedPeriods: list(fields['periodosAnulados'], (entry) => ({
      ...period(entry),
      premium: money(record(entry)['prima']),
    })),
    monthlyPremium: money(fields['primaMensual']),
    periodDays: integer(fields['diasPeriodo'], 1),
    unusedDays: integer(fields['diasNoUsados'], 0),
    proratedRefund: money(fields['devolucionProporcional']),
    voidedRefund: money(fields['devolucionPeriodosAnulados']),
    refund: money(fields['devolucion']),
    pendingAmount: money(fields['valorPendiente']),
    ruleVersion: text(fields['reglaVersion']),
    settlementHash:
      typeof fields['liquidacionHash'] === 'string' &&
      /^[0-9a-f]{64}$/.test(fields['liquidacionHash'])
        ? fields['liquidacionHash']
        : invalid(),
  };
  if (
    settlement.endedCoverages.length === 0 ||
    settlement.effectiveDate !== settlement.coverageEnd ||
    settlement.unusedDays > settlement.periodDays ||
    settlement.effectiveDate < settlement.currentPeriod.start ||
    settlement.effectiveDate > settlement.currentPeriod.end
  ) {
    invalid();
  }
  return settlement;
}

function toCancellation(value: unknown, policyId: string): PolicyCancellation {
  const fields = record(value);
  const reason = CANCELLATION_REASONS.find((item) => item === fields['motivoCancelacion']);
  const confirmedAt = text(fields['confirmadaEn']);
  if (
    !reason ||
    fields['estado'] !== 'cancelada' ||
    fields['simulada'] !== true ||
    !/T.*(?:Z|\+00:00)$/.test(confirmedAt) ||
    !Number.isFinite(Date.parse(confirmedAt))
  ) {
    invalid();
  }
  const result: PolicyCancellation = {
    id: id(fields['id']),
    policyId: id(fields['polizaId']),
    state: 'cancelada',
    reason,
    effectiveDate: day(fields['fechaEfectiva']),
    settlement: toSettlement(fields['liquidacion']),
    confirmedAt,
    simulated: true,
  };
  if (
    result.policyId.toLowerCase() !== policyId.toLowerCase() ||
    result.effectiveDate !== result.settlement.effectiveDate
  ) {
    invalid();
  }
  return result;
}

function toState(value: unknown, policyId: string): CancellationState {
  const fields = record(value);
  const reason =
    fields['motivo'] === null
      ? null
      : (NOT_CANCELLABLE_REASONS.find((item) => item === fields['motivo']) ?? invalid());
  const state = fields['estado'];
  if (typeof fields['cancelable'] !== 'boolean' || (state !== 'activa' && state !== 'cancelada')) {
    invalid();
  }
  const result: CancellationState = {
    policyId: id(fields['polizaId']),
    type: text(fields['tipo']),
    state,
    period: period(fields['vigencia']),
    cancellable: fields['cancelable'],
    reason,
    settlement: fields['liquidacion'] === null ? null : toSettlement(fields['liquidacion']),
    cancellation:
      fields['cancelacion'] === null ? null : toCancellation(fields['cancelacion'], policyId),
  };
  if (
    result.policyId.toLowerCase() !== policyId.toLowerCase() ||
    result.cancellable !== (result.reason === null) ||
    result.cancellable !== (result.settlement !== null) ||
    (result.state === 'cancelada') !== (result.reason === 'poliza_cancelada') ||
    (result.cancellation !== null && result.state !== 'cancelada')
  ) {
    invalid();
  }
  return result;
}

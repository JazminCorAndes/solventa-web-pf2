import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PolicyModificationGateway } from '../../core/policies/policy-modification.gateway';
import {
  ModificationImpact,
  ModificationOptions,
  ModificationProposal,
  ModificationResult,
  ModificationState,
  Money,
  NotModifiableReason,
  Plan,
  PolicyCoverage,
  PolicyModificationError,
  PolicyVersion,
} from '../../core/policies/policy-modification.models';
import { Period } from '../../core/policies/policy-renewal.models';

const PLANS: readonly Plan[] = ['esencial', 'integral', 'premium'];
const REASONS: readonly NotModifiableReason[] = [
  'producto_no_modificable',
  'poliza_programada',
  'poliza_vencida',
  'fin_de_vigencia',
];

@Injectable()
export class HttpPolicyModificationGateway implements PolicyModificationGateway {
  private readonly http = inject(HttpClient);

  state(policyId: string): Observable<ModificationState> {
    return this.http.get<unknown>(`${base(policyId)}/modificacion`).pipe(
      map((response) => toState(response, policyId)),
      catchError((error: unknown) => throwError(() => toModificationError(error))),
    );
  }

  simulate(policyId: string, proposal: ModificationProposal): Observable<ModificationImpact> {
    return this.http
      .post<unknown>(`${base(policyId)}/modificaciones/simulacion`, body(proposal))
      .pipe(
        map((response) => {
          const impact = toImpact(response);
          if (impact.baseVersion !== proposal.baseVersion || impact.newPlan !== proposal.plan) {
            invalid();
          }
          return impact;
        }),
        catchError((error: unknown) => throwError(() => toModificationError(error))),
      );
  }

  confirm(
    policyId: string,
    proposal: ModificationProposal,
    impactHash: string,
    idempotencyKey: string,
  ): Observable<ModificationResult> {
    return this.http
      .post<unknown>(
        `${base(policyId)}/modificaciones`,
        { ...body(proposal), confirma: true, impactoHash: impactHash },
        { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }), observe: 'response' },
      )
      .pipe(
        map((response) => {
          const result = toResult(response.body);
          if (
            ![200, 201].includes(response.status) ||
            result.policyId.toLowerCase() !== policyId.toLowerCase() ||
            result.impact.impactHash !== impactHash ||
            result.previousVersion !== proposal.baseVersion
          ) {
            invalid();
          }
          return result;
        }),
        catchError((error: unknown) => throwError(() => toModificationError(error))),
      );
  }
}

function base(policyId: string): string {
  return `${environment.apiBaseUrl}/v1/clientes/me/polizas/${encodeURIComponent(policyId)}`;
}

function body(proposal: ModificationProposal): Record<string, unknown> {
  return {
    versionBase: proposal.baseVersion,
    plan: proposal.plan,
    coberturasOpcionales: proposal.optionalCoverages,
  };
}

function toModificationError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) {
    return error;
  }
  const payload: unknown = error.error;
  const fields =
    payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const code = fields['code'];
  if (error.status === 404 && code === 'poliza_no_encontrada') {
    return new PolicyModificationError('not-found');
  }
  if (error.status === 422 && code === 'poliza_no_modificable') {
    const reason = fields['motivo'];
    return REASONS.includes(reason as NotModifiableReason)
      ? new PolicyModificationError('not-modifiable', reason as NotModifiableReason)
      : error;
  }
  if (error.status === 422 && code === 'cambio_no_permitido') {
    const field = fields['campo'];
    return new PolicyModificationError(
      'not-allowed',
      null,
      typeof field === 'string' ? field : null,
    );
  }
  if (error.status === 422 && code === 'sin_cambios') {
    return new PolicyModificationError('no-changes');
  }
  if (error.status === 409 && code === 'version_desactualizada') {
    return new PolicyModificationError('outdated-version');
  }
  if (error.status === 409 && code === 'impacto_cambio') {
    return new PolicyModificationError('impact-changed');
  }
  if (error.status === 409 && code === 'idempotencia_conflictiva') {
    return new PolicyModificationError('key-conflict');
  }
  return error;
}

function invalid(): never {
  throw new Error('The policy modification response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function bool(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}

function integer(value: unknown, minimum: number): number {
  return Number.isInteger(value) && (value as number) >= minimum ? (value as number) : invalid();
}

function day(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) && Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}

function instant(value: unknown): string {
  const result = text(value);
  return result.includes('T') && Number.isFinite(Date.parse(result)) ? result : invalid();
}

function plan(value: unknown): Plan {
  return PLANS.includes(value as Plan) ? (value as Plan) : invalid();
}

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) ? value : invalid();
}

function money(value: unknown, signed = true): Money {
  const fields = record(value);
  const amount = text(fields['monto']);
  const pattern = signed ? /^-?\d{1,16}$/ : /^[1-9]\d{0,15}$/;
  return pattern.test(amount) && fields['moneda'] === 'COP'
    ? { amount, currency: 'COP' }
    : invalid();
}

function list<T>(value: unknown, item: (entry: unknown) => T, allowEmpty = false): T[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) ? value.map(item) : invalid();
}

function period(value: unknown): Period {
  const fields = record(value);
  const result = { start: day(fields['inicio']), end: day(fields['fin']) };
  return result.end >= result.start ? result : invalid();
}

function coverage(value: unknown): PolicyCoverage {
  const fields = record(value);
  const result = {
    code: code(fields['codigo']),
    name: text(fields['nombre']),
    description: text(fields['descripcion']),
    optional: bool(fields['opcional']),
    included: bool(fields['incluida']),
  };
  return result.optional || result.included ? result : invalid();
}

function toVersion(value: unknown): PolicyVersion {
  const fields = record(value);
  const premium = record(fields['prima']);
  if (premium['periodicidad'] !== 'mensual') {
    invalid();
  }
  const origin = fields['origen'];
  if (origin !== 'emision' && origin !== 'modificacion') {
    invalid();
  }
  const endorsementId = fields['endosoId'];
  return {
    version: integer(fields['version'], 1),
    plan: plan(fields['plan']),
    coverages: list(fields['coberturas'], coverage),
    premium: money(premium, false),
    effectiveFrom: day(fields['efectivoDesde']),
    origin,
    endorsementId: endorsementId === null ? null : text(endorsementId),
    createdAt: instant(fields['creadaEn']),
  };
}

function toOptions(value: unknown): ModificationOptions {
  const fields = record(value);
  return {
    plans: list(fields['planes'], (entry) => {
      const option = record(entry);
      return {
        code: plan(option['codigo']),
        name: text(option['nombre']),
        factor: text(option['factor']),
      };
    }),
    optionalCoverages: list(
      fields['coberturasOpcionales'],
      (entry) => {
        const option = record(entry);
        return {
          code: code(option['codigo']),
          name: text(option['nombre']),
          surcharge: money(option['recargo']),
        };
      },
      true,
    ),
  };
}

function toState(value: unknown, requestedId: string): ModificationState {
  const fields = record(value);
  const reason = fields['motivo'];
  if (reason !== null && !REASONS.includes(reason as NotModifiableReason)) {
    invalid();
  }
  const state: ModificationState = {
    policyId: text(fields['polizaId']),
    type: text(fields['tipo']),
    period: period(fields['vigencia']),
    modifiable: bool(fields['modificable']),
    reason: reason as NotModifiableReason | null,
    currentVersion: fields['versionActual'] === null ? null : toVersion(fields['versionActual']),
    options: fields['opciones'] === null ? null : toOptions(fields['opciones']),
    history: list(fields['historial'], toVersion, true),
  };
  const versions = state.history.map((item) => item.version);
  if (
    state.policyId.toLowerCase() !== requestedId.toLowerCase() ||
    state.modifiable !== (state.reason === null) ||
    state.modifiable !== (state.options !== null) ||
    (state.currentVersion !== null && state.history[0]?.version !== state.currentVersion.version) ||
    versions.some((version, index) => index > 0 && version >= versions[index - 1])
  ) {
    invalid();
  }
  return state;
}

function toImpact(value: unknown): ModificationImpact {
  const fields = record(value);
  const plans = record(fields['plan']);
  const validity = record(fields['vigencia']);
  if (validity['cambia'] !== false) {
    invalid();
  }
  const impact: ModificationImpact = {
    baseVersion: integer(fields['versionBase'], 1),
    previousPlan: plan(plans['anterior']),
    newPlan: plan(plans['nuevo']),
    coverages: list(fields['coberturas'], coverage),
    added: list(fields['coberturasAgregadas'], code, true),
    removed: list(fields['coberturasRetiradas'], code, true),
    previousPremium: money(fields['primaAnterior']),
    newPremium: money(fields['primaNueva']),
    monthlyDifference: money(fields['diferenciaMensual']),
    proratedAdjustment: money(fields['ajusteProrrateado']),
    remainingDays: integer(fields['diasRestantes'], 1),
    effectiveFrom: day(fields['efectivoDesde']),
    period: period(validity),
    impactHash:
      typeof fields['impactoHash'] === 'string' && /^[0-9a-f]{64}$/.test(fields['impactoHash'])
        ? fields['impactoHash']
        : invalid(),
  };
  if (
    Number(impact.newPremium.amount) - Number(impact.previousPremium.amount) !==
    Number(impact.monthlyDifference.amount)
  ) {
    invalid();
  }
  return impact;
}

function toResult(value: unknown): ModificationResult {
  const fields = record(value);
  const result: ModificationResult = {
    endorsementId: text(fields['endosoId']),
    policyId: text(fields['polizaId']),
    previousVersion: integer(fields['versionAnterior'], 1),
    newVersion: integer(fields['versionNueva'], 2),
    version: toVersion(fields['version']),
    impact: toImpact(fields['impacto']),
    createdAt: instant(fields['creadoEn']),
  };
  if (
    result.newVersion !== result.previousVersion + 1 ||
    result.version.version !== result.newVersion ||
    result.version.endorsementId !== result.endorsementId
  ) {
    invalid();
  }
  return result;
}

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OperationalReportGateway } from '../../core/reports/operational-report.gateway';
import {
  CurrencyTotal,
  OperationalReport,
  OperationalReportError,
  PaymentTotal,
  REPORT_POLICY_STATES,
  REPORT_PRODUCTS,
  ReportDownload,
  ReportFilters,
  ReportOptions,
  ReportPolicyState,
  ReportProduct,
  ReportSource,
} from '../../core/reports/operational-report.models';

const BASE = `${environment.apiBaseUrl}/v1/reportes/operativos`;
const SOURCES: readonly ReportSource['service'][] = ['polizas', 'primas', 'siniestros'];
const PAYMENT_STATES: readonly PaymentTotal['status'][] = ['pendiente', 'confirmado', 'rechazado'];

@Injectable()
export class HttpOperationalReportGateway implements OperationalReportGateway {
  private readonly http = inject(HttpClient);

  options(): Observable<ReportOptions> {
    return this.http.get<unknown>(`${BASE}/opciones`).pipe(
      map(toOptions),
      catchError((error: unknown) => fail(error)),
    );
  }

  report(filters: ReportFilters, cutOff: string | null): Observable<OperationalReport> {
    return this.http.get<unknown>(BASE, { params: params(filters, cutOff) }).pipe(
      map((response) => {
        const report = toReport(response);
        if (
          !sameFilters(report.filters, filters) ||
          (cutOff !== null && !sameInstant(report.cutOff, cutOff))
        ) {
          invalid();
        }
        return report;
      }),
      catchError((error: unknown) => fail(error)),
    );
  }

  download(
    filters: ReportFilters,
    cutOff: string,
    fingerprint: string,
  ): Observable<ReportDownload> {
    return this.http
      .get(`${BASE}/descarga`, {
        params: params(filters, cutOff).set('huella', fingerprint),
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((response) => {
          if (response.headers.get('X-Reporte-Huella') !== fingerprint || response.body === null) {
            invalid();
          }
          return {
            file: response.body,
            fileName: `reporte-operativo-${fingerprint.slice(0, 12)}.csv`,
          };
        }),
        catchError((error: unknown) => fail(error)),
      );
  }
}

function params(filters: ReportFilters, cutOff: string | null): HttpParams {
  let result = new HttpParams().set('desde', filters.from).set('hasta', filters.to);
  if (filters.product) {
    result = result.set('producto', filters.product);
  }
  if (filters.status) {
    result = result.set('estado', filters.status);
  }
  return cutOff ? result.set('corte', cutOff) : result;
}

/** Los errores de una descarga llegan como Blob; se leen para conocer el problema. */
function fail(error: unknown): Observable<never> {
  if (!(error instanceof HttpErrorResponse)) {
    return throwError(() => error);
  }
  const body: unknown = error.error;
  const payload =
    body instanceof Blob
      ? from(body.text()).pipe(
          map((value): unknown => {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          }),
        )
      : from([body]);
  return payload.pipe(switchMap((value) => throwError(() => translate(error, value))));
}

function translate(error: HttpErrorResponse, payload: unknown): unknown {
  const fields =
    payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const code = fields['code'];
  if (error.status === 403 && code === 'alcance_insuficiente') {
    return new OperationalReportError('forbidden');
  }
  if (error.status === 400 && code === 'solicitud_invalida') {
    return new OperationalReportError('invalid-filters');
  }
  if (error.status === 503 && code === 'consolidacion_incompleta') {
    const source = fields['fuente'];
    return new OperationalReportError('incomplete', typeof source === 'string' ? source : null);
  }
  if (error.status === 409 && code === 'reporte_no_reproducible') {
    return new OperationalReportError('not-reproducible');
  }
  return error;
}

function invalid(): never {
  throw new Error('The operational report response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function count(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : invalid();
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

function hash(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : invalid();
}

function product(value: unknown): ReportProduct {
  return REPORT_PRODUCTS.includes(value as ReportProduct) ? (value as ReportProduct) : invalid();
}

function policyState(value: unknown): ReportPolicyState {
  return REPORT_POLICY_STATES.includes(value as ReportPolicyState)
    ? (value as ReportPolicyState)
    : invalid();
}

function counts(value: unknown): Record<string, number> {
  const fields = record(value);
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, count(item)]));
}

function list<T>(value: unknown, item: (entry: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(item) : invalid();
}

function total(value: unknown): CurrencyTotal {
  const fields = record(value);
  const amount = text(fields['monto']);
  const currency = text(fields['moneda']);
  return /^\d+(\.\d{2})?$/.test(amount) && /^[A-Z]{3}$/.test(currency)
    ? { currency, amount }
    : invalid();
}

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((accumulated, value) => accumulated + value, 0);
}

function sameFilters(received: ReportFilters, requested: ReportFilters): boolean {
  return (
    received.from === requested.from &&
    received.to === requested.to &&
    received.product === requested.product &&
    received.status === requested.status
  );
}

function sameInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

function toOptions(value: unknown): ReportOptions {
  const fields = record(value);
  return {
    products: list(fields['productos'], product),
    statuses: list(fields['estados'], policyState),
    maxPeriodDays: count(fields['periodoMaximoDias']) || invalid(),
  };
}

function toReport(value: unknown): OperationalReport {
  const fields = record(value);
  const filters = record(fields['filtros']);
  const indicators = record(fields['indicadores']);
  const policies = record(indicators['polizas']);
  const premiums = record(indicators['primas']);
  const claims = record(indicators['siniestros']);
  const payments = record(indicators['pagos']);
  const inconsistencies = record(fields['inconsistencias']);
  const report: OperationalReport = {
    cutOff: instant(fields['corte']),
    generatedAt: instant(fields['generadoEn']),
    filters: {
      from: day(filters['desde']),
      to: day(filters['hasta']),
      product: filters['producto'] === null ? null : product(filters['producto']),
      status: filters['estado'] === null ? null : policyState(filters['estado']),
    },
    policies: {
      issuedInPeriod: count(policies['emitidasEnPeriodo']),
      portfolio: count(policies['cartera']),
      byStatus: counts(policies['porEstado']),
    },
    premiums: {
      confirmed: count(premiums['confirmadas']),
      totals: list(premiums['totales'], total),
    },
    claims: {
      reported: count(claims['reportados']),
      byStatus: counts(claims['porEstado']),
      byType: counts(claims['porTipo']),
    },
    payments: {
      registered: count(payments['registrados']),
      byStatus: counts(payments['porEstado']),
      totals: list(payments['totales'], (entry) => {
        const item = record(entry);
        const status = item['estado'];
        if (!PAYMENT_STATES.includes(status as PaymentTotal['status'])) {
          invalid();
        }
        return { ...total(item), status: status as PaymentTotal['status'] };
      }),
    },
    byProduct: list(fields['porProducto'], (entry) => {
      const item = record(entry);
      return {
        product: product(item['producto']),
        issuedPolicies: count(item['polizasEmitidas']),
        portfolio: count(item['cartera']),
        confirmedPremiums: count(item['primasConfirmadas']),
        premiums: list(item['primas'], total),
        reportedClaims: count(item['siniestrosReportados']),
        registeredPayments: count(item['pagosRegistrados']),
      };
    }),
    inconsistencies: {
      claimsWithoutPolicy: count(inconsistencies['siniestrosSinPoliza']),
      policiesWithoutPremium: count(inconsistencies['polizasSinPrima']),
      premiumsWithOtherProduct: count(inconsistencies['primasConProductoDistinto']),
      paymentsWithoutClaim: count(inconsistencies['pagosSinSiniestro']),
    },
    sources: list(fields['fuentes'], (entry) => {
      const item = record(entry);
      const service = item['servicio'];
      if (!SOURCES.includes(service as ReportSource['service'])) {
        invalid();
      }
      return {
        service: service as ReportSource['service'],
        records: count(item['registros']),
        fingerprint: hash(item['huella']),
      };
    }),
    fingerprint: hash(fields['huella']),
  };
  // Un reporte incompleto nunca se presenta como válido: deben estar las tres fuentes y los
  // desgloses deben cuadrar con sus totales.
  if (
    new Set(report.sources.map((source) => source.service)).size !== SOURCES.length ||
    sum(report.policies.byStatus) !== report.policies.portfolio ||
    sum(report.claims.byStatus) !== report.claims.reported ||
    sum(report.payments.byStatus) !== report.payments.registered
  ) {
    invalid();
  }
  return report;
}

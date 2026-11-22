import { Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { OperationalReportGateway } from '../../core/reports/operational-report.gateway';
import {
  OperationalReport,
  OperationalReportError,
  REPORT_POLICY_STATES,
  REPORT_PRODUCTS,
  ReportDownload,
  ReportFilters,
  ReportOptions,
} from '../../core/reports/operational-report.models';

const FINGERPRINT = 'e'.repeat(64);

@Injectable()
export class MockOperationalReportGateway implements OperationalReportGateway {
  options(): Observable<ReportOptions> {
    return of({
      products: [...REPORT_PRODUCTS],
      statuses: [...REPORT_POLICY_STATES],
      maxPeriodDays: 366,
    });
  }

  report(filters: ReportFilters, cutOff: string | null): Observable<OperationalReport> {
    return defer(() =>
      of<OperationalReport>({
        cutOff: cutOff ?? new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        generatedAt: new Date().toISOString(),
        filters: { ...filters },
        policies: {
          issuedInPeriod: 12,
          portfolio: 18,
          byStatus: { programada: 1, vigente: 14, vencida: 2, cancelada: 1 },
        },
        premiums: { confirmed: 12, totals: [{ currency: 'COP', amount: '1020000.00' }] },
        claims: {
          reported: 3,
          byStatus: { reportado: 1, en_evaluacion: 1, aprobado: 1 },
          byType: { parametrico: 1, sin_tipo: 2 },
        },
        payments: {
          registered: 1,
          byStatus: { pendiente: 0, confirmado: 1, rechazado: 0 },
          totals: [{ status: 'confirmado', currency: 'COP', amount: '250000.00' }],
        },
        byProduct: [
          {
            product: 'automotive',
            issuedPolicies: 7,
            portfolio: 10,
            confirmedPremiums: 7,
            premiums: [{ currency: 'COP', amount: '595000.00' }],
            reportedClaims: 2,
            registeredPayments: 0,
          },
        ],
        inconsistencies: {
          claimsWithoutPolicy: 0,
          policiesWithoutPremium: 0,
          premiumsWithOtherProduct: 0,
          paymentsWithoutClaim: 0,
        },
        sources: [
          { service: 'polizas', records: 18, fingerprint: '1'.repeat(64) },
          { service: 'primas', records: 12, fingerprint: '2'.repeat(64) },
          { service: 'siniestros', records: 4, fingerprint: '3'.repeat(64) },
        ],
        fingerprint: FINGERPRINT,
      }),
    );
  }

  download(
    _filters: ReportFilters,
    cutOff: string,
    fingerprint: string,
  ): Observable<ReportDownload> {
    return defer(() => {
      if (fingerprint !== FINGERPRINT) {
        throw new OperationalReportError('not-reproducible');
      }
      const csv = `ambito,indicador,dimension,moneda,valor\nreporte,corte,,,${cutOff}\n`;
      return of({
        file: new Blob([csv], { type: 'text/csv' }),
        fileName: `reporte-operativo-${fingerprint.slice(0, 12)}.csv`,
      });
    });
  }
}

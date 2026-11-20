import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  OperationalReport,
  ReportDownload,
  ReportFilters,
  ReportOptions,
} from './operational-report.models';

export interface OperationalReportGateway {
  options(): Observable<ReportOptions>;
  /** Sin corte, el backend fija el corte vigente y lo devuelve en el reporte. */
  report(filters: ReportFilters, cutOff: string | null): Observable<OperationalReport>;
  /** Descarga el reporte confirmado; el backend lo rechaza si ya no coincide con la huella. */
  download(filters: ReportFilters, cutOff: string, fingerprint: string): Observable<ReportDownload>;
}

export const OPERATIONAL_REPORT_GATEWAY = new InjectionToken<OperationalReportGateway>(
  'OPERATIONAL_REPORT_GATEWAY',
);

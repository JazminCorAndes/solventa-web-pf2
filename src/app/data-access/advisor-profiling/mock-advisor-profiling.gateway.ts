import { Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';
import { AdvisorProfilingGateway } from '../../core/advisor-profiling/advisor-profiling.gateway';
import {
  MortgageProfilingError,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
} from '../../core/advisor-profiling/advisor-profiling.models';

@Injectable()
export class MockAdvisorProfilingGateway implements AdvisorProfilingGateway {
  private readonly operations = new Map<
    string,
    { fingerprint: string; record: MortgageProfilingRecord }
  >();

  start(request: MortgageProfilingRequest): Observable<MortgageProfilingRecord> {
    if (!hasRequiredData(request)) {
      return throwError(() => new MortgageProfilingError('incomplete_data'));
    }
    if (
      !request.consentReference.toUpperCase().startsWith('CONS-') ||
      request.consentReference.toUpperCase() === 'CONS-INVALIDO'
    ) {
      return throwError(() => new MortgageProfilingError('invalid_consent'));
    }

    const fingerprint = JSON.stringify(request);
    const existing = this.operations.get(request.operationId);
    if (existing?.fingerprint !== undefined && existing.fingerprint !== fingerprint) {
      return throwError(() => new MortgageProfilingError('idempotency_conflict'));
    }
    if (existing) {
      return of(existing.record).pipe(delay(150));
    }

    const record: MortgageProfilingRecord = {
      operationId: request.operationId,
      profilingReference: `PRF-HIP-${request.operationId.slice(0, 8).toUpperCase()}`,
      status: 'processing',
      receivedAt: new Date().toISOString(),
    };
    this.operations.set(request.operationId, { fingerprint, record });
    return of(record).pipe(delay(900));
  }
}

function hasRequiredData(request: MortgageProfilingRequest): boolean {
  return Boolean(
    request.operationId &&
    request.partnerId &&
    request.customer.documentNumber &&
    request.customer.fullName &&
    request.customer.email &&
    request.customer.phone &&
    request.credit.reference &&
    request.credit.amount > 0 &&
    request.credit.termMonths > 0 &&
    request.consentReference,
  );
}

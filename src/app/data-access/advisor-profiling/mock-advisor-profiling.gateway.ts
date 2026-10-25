import { Injectable } from '@angular/core';
import { delay, Observable, of, throwError } from 'rxjs';
import { AdvisorProfilingGateway } from '../../core/advisor-profiling/advisor-profiling.gateway';
import {
  MortgageProfilingError,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
  MORTGAGE_UUID_PATTERN,
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
      !MORTGAGE_UUID_PATTERN.test(request.consent.id) ||
      request.consent.id === '00000000-0000-0000-0000-000000000000' ||
      request.consent.version < 1
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
      partnerId: request.partnerId,
      customerId: request.customer.id,
      productId: 'mortgage-life',
      profilingReference: `PRF-HIP-${request.operationId.slice(0, 8).toUpperCase()}`,
      quoteRequestId: `AQT-${request.operationId.slice(0, 8).toUpperCase()}`,
      quoteId: crypto.randomUUID(),
      status: 'completed',
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
    MORTGAGE_UUID_PATTERN.test(request.customer.id) &&
    request.customer.documentNumber &&
    request.customer.phone &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.customer.birthDate) &&
    request.credit.reference &&
    request.credit.amount > 0 &&
    request.credit.termMonths > 0 &&
    request.consent.id &&
    request.consent.version > 0,
  );
}

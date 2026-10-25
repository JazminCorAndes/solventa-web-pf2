import { DocumentType } from '../auth/auth.models';

export const MORTGAGE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MortgageProfilingInput {
  partnerId: string;
  customer: {
    id: string;
    documentType: DocumentType;
    documentNumber: string;
    phone: string;
    birthDate: string;
  };
  credit: {
    reference: string;
    amount: number;
    termMonths: number;
  };
  consent: {
    id: string;
    version: number;
  };
}

export interface MortgageProfilingRequest extends MortgageProfilingInput {
  operationId: string;
}

export interface MortgageProfilingRecord {
  operationId: string;
  partnerId: string;
  customerId: string;
  productId: 'mortgage-life';
  profilingReference: string;
  quoteRequestId: string;
  quoteId: string;
  status: 'completed';
  receivedAt: string;
}

export type MortgageProfilingErrorCode =
  | 'incomplete_data'
  | 'invalid_consent'
  | 'unauthorized_partner'
  | 'idempotency_conflict'
  | 'service_unavailable'
  | 'invalid_response'
  | 'session_expired'
  | 'customer_not_found'
  | 'profiling_failed'
  | 'operation_in_progress'
  | 'operation_retryable'
  | 'rate_limited'
  | 'advisor_context_unavailable'
  | 'unexpected';

export class MortgageProfilingError extends Error {
  constructor(readonly code: MortgageProfilingErrorCode) {
    super(code);
  }
}

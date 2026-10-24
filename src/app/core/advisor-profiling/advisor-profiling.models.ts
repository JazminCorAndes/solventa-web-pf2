import { DocumentType } from '../auth/auth.models';

export interface MortgageProfilingInput {
  partnerId: string;
  customer: {
    documentType: DocumentType;
    documentNumber: string;
    fullName: string;
    email: string;
    phone: string;
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
  profilingReference: string;
  status: 'processing';
  receivedAt: string;
}

export type MortgageProfilingErrorCode =
  | 'incomplete_data'
  | 'invalid_consent'
  | 'unauthorized_partner'
  | 'idempotency_conflict'
  | 'service_unavailable'
  | 'unexpected';

export class MortgageProfilingError extends Error {
  constructor(readonly code: MortgageProfilingErrorCode) {
    super(code);
  }
}

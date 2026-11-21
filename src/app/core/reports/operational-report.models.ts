export const REPORT_PRODUCTS = [
  'automotive',
  'travel',
  'life',
  'device-protection',
  'parametric',
  'parametric-weather',
  'payment-protection',
  'mortgage-life',
] as const;
export type ReportProduct = (typeof REPORT_PRODUCTS)[number];

export const REPORT_POLICY_STATES = ['programada', 'vigente', 'vencida', 'cancelada'] as const;
export type ReportPolicyState = (typeof REPORT_POLICY_STATES)[number];

export interface ReportFilters {
  from: string;
  to: string;
  product: ReportProduct | null;
  status: ReportPolicyState | null;
}

export interface ReportOptions {
  products: ReportProduct[];
  statuses: ReportPolicyState[];
  maxPeriodDays: number;
}

export interface CurrencyTotal {
  currency: string;
  amount: string;
}

export interface PaymentTotal extends CurrencyTotal {
  status: 'pendiente' | 'confirmado' | 'rechazado';
}

export interface ProductBreakdown {
  product: ReportProduct;
  issuedPolicies: number;
  portfolio: number;
  confirmedPremiums: number;
  premiums: CurrencyTotal[];
  reportedClaims: number;
  registeredPayments: number;
}

export interface ReportSource {
  service: 'polizas' | 'primas' | 'siniestros';
  records: number;
  fingerprint: string;
}

/** Indicadores agregados calculados por el BFF Web; la interfaz solo los presenta. */
export interface OperationalReport {
  cutOff: string;
  generatedAt: string;
  filters: ReportFilters;
  policies: { issuedInPeriod: number; portfolio: number; byStatus: Record<string, number> };
  premiums: { confirmed: number; totals: CurrencyTotal[] };
  claims: {
    reported: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  payments: { registered: number; byStatus: Record<string, number>; totals: PaymentTotal[] };
  byProduct: ProductBreakdown[];
  inconsistencies: {
    claimsWithoutPolicy: number;
    policiesWithoutPremium: number;
    premiumsWithOtherProduct: number;
    paymentsWithoutClaim: number;
  };
  sources: ReportSource[];
  fingerprint: string;
}

export interface ReportDownload {
  file: Blob;
  fileName: string;
}

export type OperationalReportErrorKind =
  'forbidden' | 'invalid-filters' | 'incomplete' | 'not-reproducible';

export class OperationalReportError extends Error {
  constructor(
    readonly kind: OperationalReportErrorKind,
    readonly source: string | null = null,
  ) {
    super(`Operational report failed: ${kind}`);
    this.name = 'OperationalReportError';
  }
}

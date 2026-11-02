export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  available: boolean;
  mainCoverages: string[];
}

export interface InsuranceProductDetail extends InsuranceProduct {
  coverages: Array<{ name: string; description: string }>;
  conditions: string[];
  information: {
    insuredAmount: string;
    deductible: string;
    currency: string;
    validity: string;
  };
}

export interface TravelDestination {
  code: string;
  name: string;
}

export const FLIGHT_COVERAGE_TYPES = [
  'delay-cancellation',
  'missed-connection',
  'comprehensive',
] as const;
export type FlightCoverageType = (typeof FLIGHT_COVERAGE_TYPES)[number];

export const WEATHER_EVENT_TYPES = ['heavy-rain', 'drought'] as const;
export type WeatherEventType = (typeof WEATHER_EVENT_TYPES)[number];

export type CustomerType = 'natural';
export type DocumentType = 'cc' | 'ce' | 'passport' | 'ppt';

export type QuoteProductData = Readonly<Record<string, string>>;

export interface QuoteRequestDraft {
  productId: string;
  productData: QuoteProductData;
}

export interface QuoteRequestRecord extends QuoteRequestDraft {
  customerType: CustomerType;
  documentType: DocumentType;
  nationalId: string;
  email: string;
  phone: string;
  id: string;
  status: 'received';
  createdAt: string;
}

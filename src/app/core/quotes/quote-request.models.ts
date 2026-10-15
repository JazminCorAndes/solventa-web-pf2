export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

export interface TravelDestination {
  code: string;
  name: string;
}

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

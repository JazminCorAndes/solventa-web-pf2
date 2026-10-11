export interface InsuranceProduct {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

export type CustomerType = 'natural';

export interface QuoteRequestDraft {
  productId: string;
  customerType: CustomerType;
  nationalId: string;
  vehiclePlate: string;
  email: string;
  phone: string;
}

export interface QuoteRequestRecord extends QuoteRequestDraft {
  id: string;
  status: 'received';
  createdAt: string;
}

export interface InsuranceProductSummary {
  id: string;
  name: string;
  description: string;
  available: boolean;
  mainCoverages: string[];
}

export interface InsuranceProductDetail extends InsuranceProductSummary {
  coverages: Array<{
    name: string;
    description: string;
  }>;
  conditions: string[];
  relevantInformation: {
    insuredAmount: number;
    deductible: number;
    currency: string;
    term: string;
  };
}

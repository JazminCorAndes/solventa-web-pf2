export class QuoteRequestUnavailableError extends Error {
  override readonly name = 'QuoteRequestUnavailableError';

  constructor() {
    super('Quote request service unavailable');
  }
}

export class InsuranceProductUnavailableError extends Error {
  override readonly name = 'InsuranceProductUnavailableError';

  constructor() {
    super('The selected insurance product is unavailable');
  }
}

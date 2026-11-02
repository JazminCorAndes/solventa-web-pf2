export class OfferUnavailableError extends Error {
  override readonly name = 'OfferUnavailableError';

  constructor() {
    super('The selected offer is no longer available');
  }
}

export class OfferSelectionRequiredError extends Error {
  override readonly name = 'OfferSelectionRequiredError';

  constructor() {
    super('An offer must be selected');
  }
}

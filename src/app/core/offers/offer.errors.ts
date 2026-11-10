import { HttpErrorResponse } from '@angular/common/http';

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

export class OfferSelectionChangedError extends Error {
  override readonly name = 'OfferSelectionChangedError';

  constructor() {
    super('The current selection must be reviewed again before acceptance');
  }
}

export function offerUnavailableError(error: unknown): OfferUnavailableError | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) return null;
  const body: unknown = error.error;
  return body !== null &&
    typeof body === 'object' &&
    'code' in body &&
    body.code === 'oferta_no_disponible'
    ? new OfferUnavailableError()
    : null;
}

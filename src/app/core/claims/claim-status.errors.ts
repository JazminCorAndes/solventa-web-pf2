/** El siniestro no existe o no pertenece al cliente; el Backend no distingue ambos casos. */
export class ClaimNotFoundError extends Error {
  override readonly name = 'ClaimNotFoundError';

  constructor() {
    super('The claim is not available for the current account');
  }
}

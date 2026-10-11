export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';

  constructor() {
    super('Invalid credentials');
  }
}

export class AuthenticationUnavailableError extends Error {
  override readonly name = 'AuthenticationUnavailableError';

  constructor() {
    super('Authentication service unavailable');
  }
}

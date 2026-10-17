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

export class InvalidRefreshTokenError extends Error {
  override readonly name = 'InvalidRefreshTokenError';

  constructor() {
    super('Refresh token is invalid or expired');
  }
}

export class EmailAlreadyRegisteredError extends Error {
  override readonly name = 'EmailAlreadyRegisteredError';

  constructor() {
    super('Email is already registered');
  }
}

export class TooManyAttemptsError extends Error {
  override readonly name = 'TooManyAttemptsError';

  constructor(readonly retryAfterSeconds: number | null) {
    super('Too many attempts');
  }
}

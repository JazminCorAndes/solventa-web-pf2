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

export class SessionChangedError extends Error {
  override readonly name = 'SessionChangedError';

  constructor() {
    super('The authentication request belongs to an earlier session');
  }
}

export class AccessDeniedError extends Error {
  override readonly name = 'AccessDeniedError';

  constructor() {
    super('Access denied');
  }
}

export class LoginEncryptionUnavailableError extends Error {
  override readonly name = 'LoginEncryptionUnavailableError';

  constructor() {
    super('Login requires a secure context and Web Crypto support');
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

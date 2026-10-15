export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegistrationData {
  name: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'client';
}

/** `expiresAt` es el vencimiento del access token, tal como lo informa el backend. */
export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: number;
}

export interface AuthGrant {
  session: AuthSession;
  tokens: AuthTokens;
}

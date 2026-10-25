export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegistrationData {
  name: string;
  email: string;
  password: string;
}
export type DocumentType = 'cc' | 'ce' | 'passport' | 'ppt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'partner' | 'advisor';
  partnerIds?: string[];
  documentType?: DocumentType;
  nationalId?: string;
  phone?: string;
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

export function isPartnerIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === 'string' && id.trim().length > 0) &&
    new Set(value).size === value.length
  );
}

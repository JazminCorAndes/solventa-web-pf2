export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegistrationData {
  name: string;
  email: string;
  password: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  birthDate: string;
  consent: {
    authorized: boolean;
    termsVersion: '1.0';
  };
}
export type DocumentType = 'cc' | 'ce' | 'passport' | 'ppt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'partner' | 'advisor' | 'administrator';
  partnerIds?: string[];
  permissions?: string[];
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

export function canReviewClaims(user: AuthUser | null): boolean {
  return (
    user?.role === 'administrator' ||
    (user?.role === 'advisor' && user.permissions?.includes('siniestros:revisar') === true)
  );
}

export function canReadOperationalReports(user: AuthUser | null): boolean {
  return (
    user?.role === 'administrator' ||
    (user?.role === 'advisor' && user.permissions?.includes('reportes:operativos') === true)
  );
}

export function exceptionPartnerIds(user: AuthUser | null): string[] {
  if (user?.role !== 'advisor') return [];
  const prefix = 'open_finance:resolver:';
  return (user.permissions ?? [])
    .filter((permission) => permission.startsWith(prefix) && permission.length > prefix.length)
    .map((permission) => permission.slice(prefix.length));
}

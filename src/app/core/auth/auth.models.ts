export interface LoginCredentials {
  email: string;
  password: string;
}

export type DocumentType = 'cc' | 'ce' | 'passport' | 'ppt';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'client';
  documentType: DocumentType;
  nationalId: string;
  phone: string;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}

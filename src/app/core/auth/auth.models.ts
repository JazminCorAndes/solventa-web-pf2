export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'client';
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: number;
}

import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthGrant,
  AuthSession,
  AuthUser,
  LoginCredentials,
  RegistrationData,
} from './auth.models';

export interface AuthGateway {
  requestPasswordRecovery(email: string): Observable<void>;
  resetPassword(token: string, password: string): Observable<void>;
  register(data: RegistrationData): Observable<AuthUser>;
  login(credentials: LoginCredentials): Observable<AuthGrant>;
  refresh(refreshToken: string): Observable<AuthGrant>;
  currentSession(): Observable<AuthSession | null>;
  logout(refreshToken: string | null): Observable<void>;
}

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY');

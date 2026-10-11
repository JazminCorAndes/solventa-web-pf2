import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSession, LoginCredentials } from './auth.models';

export interface AuthGateway {
  login(credentials: LoginCredentials): Observable<AuthSession>;
  currentSession(): Observable<AuthSession | null>;
  logout(): Observable<void>;
}

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY');

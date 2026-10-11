import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSession, LoginCredentials } from './auth.models';

export interface AuthGateway {
  login(credentials: LoginCredentials): Observable<AuthSession>;
}

export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY');

import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { AuthSession } from './auth.models';

const SESSION_KEY = 'solventa.auth.session';

export interface AuthStorage {
  read(): AuthSession | null;
  write(session: AuthSession): void;
  clear(): void;
}

export const AUTH_STORAGE = new InjectionToken<AuthStorage>('AUTH_STORAGE');

@Injectable()
export class BrowserAuthStorage implements AuthStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): AuthSession | null {
    const value = this.storage?.getItem(SESSION_KEY);
    if (!value) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (isAuthSession(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Stored authentication session could not be parsed.', error);
    }

    this.clear();
    return null;
  }

  write(session: AuthSession): void {
    this.storage?.setItem(SESSION_KEY, JSON.stringify(session));
  }

  clear(): void {
    this.storage?.removeItem(SESSION_KEY);
  }
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthSession>;
  const user = candidate.user;
  return (
    typeof candidate.expiresAt === 'number' &&
    !!user &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    user.role === 'client'
  );
}

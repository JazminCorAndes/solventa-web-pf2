import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { AuthUser } from './auth.models';

const STORAGE_KEY = 'solventa.auth.refresh';
const LEGACY_SESSION_KEY = 'solventa.auth.session';

/** Lo único que sobrevive a una recarga: el refresh token y el usuario. El access token no se guarda. */
export interface StoredAuth {
  user: AuthUser;
  refreshToken: string;
  refreshExpiresAt: number;
}

export interface AuthStorage {
  read(): StoredAuth | null;
  write(auth: StoredAuth): void;
  clear(): void;
}

export const AUTH_STORAGE = new InjectionToken<AuthStorage>('AUTH_STORAGE');

@Injectable()
export class BrowserAuthStorage implements AuthStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): StoredAuth | null {
    const value = this.storage?.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (isStoredAuth(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Stored authentication data could not be parsed.', error);
    }

    this.clear();
    return null;
  }

  write(auth: StoredAuth): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(auth));
  }

  clear(): void {
    this.storage?.removeItem(STORAGE_KEY);
    this.storage?.removeItem(LEGACY_SESSION_KEY);
  }
}

function isStoredAuth(value: unknown): value is StoredAuth {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredAuth>;
  const user = candidate.user;
  return (
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.refreshExpiresAt === 'number' &&
    Number.isFinite(candidate.refreshExpiresAt) &&
    !!user &&
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    (user.role === 'client' ||
      (user.role === 'partner' &&
        Array.isArray(user.partnerIds) &&
        user.partnerIds.length > 0 &&
        user.partnerIds.every((id) => typeof id === 'string' && id.trim().length > 0))) &&
    (user.documentType === undefined ||
      user.documentType === 'cc' ||
      user.documentType === 'ce' ||
      user.documentType === 'passport' ||
      user.documentType === 'ppt') &&
    (user.nationalId === undefined || typeof user.nationalId === 'string') &&
    (user.phone === undefined || typeof user.phone === 'string')
  );
}

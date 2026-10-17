import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, tap, throwError } from 'rxjs';
import { AUTH_GATEWAY } from './auth.gateway';
import { AuthSession, LoginCredentials } from './auth.models';
import { AUTH_STORAGE } from './auth-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly gateway = inject(AUTH_GATEWAY);
  private readonly storage = inject(AUTH_STORAGE);
  private readonly sessionState = signal<AuthSession | null>(this.restoreSession());

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.gateway.login(credentials).pipe(
      tap((session) => {
        this.storage.write(session);
        this.sessionState.set(session);
      }),
    );
  }

  synchronizeSession(): Observable<void> {
    return this.gateway.currentSession().pipe(
      tap((session) => {
        if (session) {
          this.storage.write(session);
          this.sessionState.set(session);
        } else {
          this.clearLocalSession();
        }
      }),
      catchError((error: unknown) => {
        this.clearLocalSession();
        return throwError(() => error);
      }),
      map(() => undefined),
    );
  }

  logout(): Observable<void> {
    return this.gateway.logout().pipe(finalize(() => this.clearLocalSession()));
  }

  hasActiveSession(): boolean {
    const session = this.sessionState();
    if (!session) {
      return false;
    }

    if (session.expiresAt <= Date.now()) {
      this.clearLocalSession();
      return false;
    }

    return true;
  }

  private restoreSession(): AuthSession | null {
    const session = this.storage.read();
    if (!session || session.expiresAt <= Date.now()) {
      this.storage.clear();
      return null;
    }
    return session;
  }

  private clearLocalSession(): void {
    this.storage.clear();
    this.sessionState.set(null);
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import {
  catchError,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { InvalidRefreshTokenError } from './auth.errors';
import { AUTH_GATEWAY } from './auth.gateway';
import {
  AuthGrant,
  AuthSession,
  AuthUser,
  LoginCredentials,
  RegistrationData,
} from './auth.models';
import { AUTH_STORAGE } from './auth-storage.service';

/** Margen para renovar antes de que el access token venza durante una petición. */
const ACCESS_TOKEN_SKEW_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly gateway = inject(AUTH_GATEWAY);
  private readonly storage = inject(AUTH_STORAGE);

  // El access token vive solo en memoria; el refresh token también se guarda en sessionStorage.
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshToken: string | null = null;
  private refreshExpiresAt = 0;
  private refreshInFlight: Observable<string> | null = null;

  private readonly sessionState = signal<AuthSession | null>(this.restoreSession());

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);

  register(data: RegistrationData): Observable<AuthUser> {
    return this.gateway.register(data);
  }

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return this.gateway.login(credentials).pipe(
      tap((grant) => this.applyGrant(grant)),
      map((grant) => grant.session),
    );
  }

  /** Restaura la sesión tras una recarga: con el refresh guardado obtiene un access token nuevo. */
  synchronizeSession(): Observable<void> {
    if (!this.refreshToken || this.refreshExpiresAt <= Date.now()) {
      this.clearLocalSession();
      return of(undefined);
    }

    return this.renewAccessToken().pipe(
      map(() => undefined),
      catchError((error: unknown) =>
        error instanceof InvalidRefreshTokenError ? of(undefined) : throwError(() => error),
      ),
    );
  }

  /** Access token vigente; si falta o está por vencer, lo renueva con el refresh token. */
  getAccessToken(): Observable<string | null> {
    if (this.accessToken && this.accessExpiresAt - ACCESS_TOKEN_SKEW_MS > Date.now()) {
      return of(this.accessToken);
    }
    return this.refreshToken ? this.renewAccessToken() : of(null);
  }

  /**
   * Renueva el access token. Todas las llamadas concurrentes comparten una sola petición de
   * renovación. Si `rejectedToken` ya fue reemplazado por otra renovación, reutiliza el nuevo.
   */
  renewAccessToken(rejectedToken?: string): Observable<string> {
    if (rejectedToken && this.accessToken && this.accessToken !== rejectedToken) {
      return of(this.accessToken);
    }
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    if (!this.refreshToken || this.refreshExpiresAt <= Date.now()) {
      this.clearLocalSession();
      return throwError(() => new InvalidRefreshTokenError());
    }

    const request$ = this.gateway.refresh(this.refreshToken).pipe(
      tap((grant) => this.applyGrant(grant)),
      map((grant) => grant.tokens.accessToken),
      catchError((error: unknown) => {
        if (error instanceof InvalidRefreshTokenError) {
          this.clearLocalSession();
        }
        return throwError(() => error);
      }),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.refreshInFlight = request$;
    return request$;
  }

  logout(): Observable<void> {
    return this.gateway
      .logout(this.refreshToken)
      .pipe(finalize(() => this.clearLocalSession()));
  }

  hasActiveSession(): boolean {
    if (!this.sessionState()) {
      return false;
    }

    const now = Date.now();
    const refreshValid = !!this.refreshToken && this.refreshExpiresAt > now;
    const accessValid = !!this.accessToken && this.accessExpiresAt > now;
    if (refreshValid || accessValid) {
      return true;
    }

    this.clearLocalSession();
    return false;
  }

  private applyGrant(grant: AuthGrant): void {
    this.accessToken = grant.tokens.accessToken;
    this.accessExpiresAt = grant.session.expiresAt;
    this.refreshToken = grant.tokens.refreshToken;
    this.refreshExpiresAt = grant.tokens.refreshExpiresAt;
    this.storage.write({
      user: grant.session.user,
      refreshToken: grant.tokens.refreshToken,
      refreshExpiresAt: grant.tokens.refreshExpiresAt,
    });
    this.sessionState.set(grant.session);
  }

  private restoreSession(): AuthSession | null {
    const stored = this.storage.read();
    if (!stored || stored.refreshExpiresAt <= Date.now()) {
      this.storage.clear();
      return null;
    }

    this.refreshToken = stored.refreshToken;
    this.refreshExpiresAt = stored.refreshExpiresAt;
    // Sin access token en memoria: expiresAt 0 hasta que la renovación lo informe.
    return { user: stored.user, expiresAt: 0 };
  }

  private clearLocalSession(): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.refreshToken = null;
    this.refreshExpiresAt = 0;
    this.storage.clear();
    this.sessionState.set(null);
  }
}

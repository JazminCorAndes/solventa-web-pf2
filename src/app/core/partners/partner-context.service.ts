import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { map, Observable, Subscription, tap, throwError, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface PartnerContext {
  apiVersion: '1';
  usuario: { id: string; nombre: string; correo: string; rol: 'socio'; socios: string[] };
  socios: { socioId: string; productos: string[] }[];
  alcances: string[];
}

export class PartnerAccessError extends Error {
  constructor(readonly reason: 'forbidden' | 'contract' | 'expired') {
    super(reason);
  }
}

@Injectable({ providedIn: 'root' })
export class PartnerContextService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly state = signal<PartnerContext | null>(null);
  private expiration?: Subscription;
  private generation = 0;
  private ownerId = this.auth.user()?.id;
  readonly context = this.state.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (this.ownerId !== user?.id || user?.role !== 'partner') {
        this.ownerId = user?.id;
        this.clear();
      }
    });
  }

  load(): Observable<PartnerContext> {
    this.clear();
    const generation = this.generation;
    this.ownerId = this.auth.user()?.id;
    const user = this.auth.user();
    if (user?.role !== 'partner') {
      return throwError(() => new PartnerAccessError('forbidden'));
    }
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/v1/socios/actual`, {
        headers: { 'API-Version': '1' },
      })
      .pipe(
        map((response) => {
          const current = this.auth.user();
          if (
            generation !== this.generation ||
            current?.id !== user.id ||
            current.role !== 'partner' ||
            (this.auth.session()?.expiresAt ?? 0) <= Date.now()
          ) {
            throw new PartnerAccessError('expired');
          }
          if (
            !isPartnerContext(response) ||
            response.usuario.id !== current.id ||
            response.socios.some((partner) => !current.partnerIds?.includes(partner.socioId))
          ) {
            throw new PartnerAccessError('contract');
          }
          return response;
        }),
        tap((context) => {
          this.state.set(context);
          this.expiration = timer(
            Math.max(0, (this.auth.session()?.expiresAt ?? 0) - Date.now()),
          ).subscribe(() => {
            this.clear();
            void this.router.navigate(['/acceso-no-disponible'], {
              queryParams: { reason: 'expired' },
            });
          });
        }),
      );
  }

  clear(): void {
    this.generation++;
    this.expiration?.unsubscribe();
    this.state.set(null);
  }
}

export function partnerErrorReason(error: unknown): string {
  if (error instanceof PartnerAccessError) return error.reason;
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'expired';
    if (error.status === 403) return 'forbidden';
    if (error.status === 429) return 'quota';
  }
  return 'unavailable';
}

function isStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0)
  );
}

function isPartnerContext(value: unknown): value is PartnerContext {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PartnerContext>;
  const user = data.usuario;
  return (
    data.apiVersion === '1' &&
    !!user &&
    user.rol === 'socio' &&
    typeof user.id === 'string' &&
    typeof user.nombre === 'string' &&
    typeof user.correo === 'string' &&
    isStrings(user.socios) &&
    user.socios.length > 0 &&
    isStrings(data.alcances) &&
    Array.isArray(data.socios) &&
    data.socios.length > 0 &&
    data.socios.every(
      (partner) =>
        partner &&
        typeof partner.socioId === 'string' &&
        user.socios.includes(partner.socioId) &&
        isStrings(partner.productos),
    ) &&
    new Set(data.socios.map((partner) => partner.socioId)).size === data.socios.length
  );
}

import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { POLICY_RENEWAL_GATEWAY } from '../../core/policies/policy-renewal.gateway';
import {
  NotRenewableReason,
  POLICY_ID_PATTERN,
  PolicyRenewalError,
  Renewal,
  RenewalEligibility,
} from '../../core/policies/policy-renewal.models';

type LoadState = 'loading' | 'ready' | 'not-found' | 'invalid' | 'error';
type Outcome =
  | { kind: 'renewed'; renewal: Renewal }
  | { kind: 'rejected'; renewal: Renewal }
  | { kind: 'pending'; renewal: Renewal }
  | { kind: 'conditions-changed' }
  | { kind: 'in-progress' }
  | { kind: 'not-renewable'; reason: NotRenewableReason }
  | { kind: 'unconfirmed' };

interface PendingKey {
  conditionsHash: string;
  key: string;
}

@Component({
  selector: 'app-policy-renewal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './policy-renewal-page.component.html',
  styleUrl: './policy-renewal-page.component.scss',
})
export class PolicyRenewalPageComponent implements OnInit {
  private readonly gateway = inject(POLICY_RENEWAL_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);

  readonly policyId = signal<string | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly eligibility = signal<RenewalEligibility | null>(null);
  readonly accepted = signal(false);
  readonly submitting = signal(false);
  readonly outcome = signal<Outcome | null>(null);
  private readonly keys = new Map<string, PendingKey>();

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const policyId = params.get('policyId');
      this.outcome.set(null);
      this.accepted.set(false);
      if (policyId === null || !POLICY_ID_PATTERN.test(policyId)) {
        this.policyId.set(null);
        this.state.set('invalid');
        return;
      }
      this.policyId.set(policyId);
      this.load();
    });
  }

  load(): void {
    const policyId = this.policyId();
    if (!policyId) {
      return;
    }
    this.state.set('loading');
    this.eligibility.set(null);
    this.gateway
      .eligibility(policyId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (eligibility) => {
          this.eligibility.set(eligibility);
          this.state.set('ready');
          const last = eligibility.lastAttempt;
          if (last?.state === 'pendiente' && this.pendingKey(policyId)) {
            this.outcome.set({ kind: 'pending', renewal: last });
          }
        },
        error: (error: unknown) => {
          if (error instanceof PolicyRenewalError && error.kind === 'not-found') {
            this.state.set('not-found');
            return;
          }
          console.error('Policy renewal eligibility could not be loaded.', error);
          this.state.set('error');
        },
      });
  }

  toggleAcceptance(checked: boolean): void {
    this.accepted.set(checked);
  }

  /**
   * La misma clave se reutiliza mientras el resultado no sea definitivo (503 o pendiente),
   * de modo que un reintento consulta el mismo intento y nunca genera un segundo cobro.
   */
  confirm(): void {
    const policyId = this.policyId();
    const offer = this.eligibility()?.offer;
    const pending = policyId ? this.pendingKey(policyId) : null;
    const conditionsHash = pending?.conditionsHash ?? offer?.conditionsHash;
    if (!policyId || !conditionsHash || this.submitting()) {
      return;
    }
    if (!pending && !this.accepted()) {
      return;
    }
    const key = pending?.key ?? crypto.randomUUID();
    this.storePendingKey(policyId, { conditionsHash, key });
    this.submitting.set(true);
    this.outcome.set(null);
    this.gateway
      .renew(policyId, conditionsHash, key)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: ({ renewal }) => {
          if (renewal.state === 'pendiente') {
            this.outcome.set({ kind: 'pending', renewal });
            return;
          }
          this.clearPendingKey(policyId);
          this.accepted.set(false);
          this.outcome.set({
            kind: renewal.state === 'renovada' ? 'renewed' : 'rejected',
            renewal,
          });
          if (renewal.state === 'renovada') {
            this.refreshAfterRenewal(policyId);
          }
        },
        error: (error: unknown) => this.handleError(policyId, error),
      });
  }

  hasPendingKey(): boolean {
    const policyId = this.policyId();
    return policyId !== null && this.pendingKey(policyId) !== null;
  }

  amount(value: string): number {
    return Number(value);
  }

  private handleError(policyId: string, error: unknown): void {
    if (error instanceof PolicyRenewalError) {
      this.clearPendingKey(policyId);
      this.accepted.set(false);
      if (error.kind === 'conditions-changed') {
        this.outcome.set({ kind: 'conditions-changed' });
        this.load();
        return;
      }
      if (error.kind === 'in-progress') {
        this.outcome.set({ kind: 'in-progress' });
        return;
      }
      if (error.kind === 'not-renewable' && error.reason) {
        this.outcome.set({ kind: 'not-renewable', reason: error.reason });
        this.load();
        return;
      }
    }
    console.error('Policy renewal was not confirmed.', error);
    this.outcome.set({ kind: 'unconfirmed' });
  }

  private refreshAfterRenewal(policyId: string): void {
    this.gateway
      .eligibility(policyId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (eligibility) => this.eligibility.set(eligibility),
        error: () => undefined,
      });
  }

  private storageKey(policyId: string): string {
    return `solventa.policyRenewal.${this.auth.user()?.id ?? 'anonymous'}.${policyId}`;
  }

  private pendingKey(policyId: string): PendingKey | null {
    const inMemory = this.keys.get(this.storageKey(policyId));
    if (inMemory) {
      return inMemory;
    }
    try {
      const stored: unknown = JSON.parse(
        sessionStorage.getItem(this.storageKey(policyId)) ?? 'null',
      );
      if (
        stored !== null &&
        typeof stored === 'object' &&
        typeof (stored as PendingKey).key === 'string' &&
        typeof (stored as PendingKey).conditionsHash === 'string'
      ) {
        return stored as PendingKey;
      }
    } catch {
      // Un valor corrupto equivale a no tener un intento pendiente.
    }
    return null;
  }

  private storePendingKey(policyId: string, pending: PendingKey): void {
    this.keys.set(this.storageKey(policyId), pending);
    try {
      sessionStorage.setItem(this.storageKey(policyId), JSON.stringify(pending));
    } catch {
      // Sin almacenamiento la clave sigue disponible en memoria mientras dure la vista.
    }
  }

  private clearPendingKey(policyId: string): void {
    this.keys.delete(this.storageKey(policyId));
    try {
      sessionStorage.removeItem(this.storageKey(policyId));
    } catch {
      // Nada que limpiar.
    }
  }
}

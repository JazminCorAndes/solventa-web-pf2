import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { combineLatest, distinctUntilChanged, finalize, map, Subscription, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { PolicyCancellationAttempts } from '../../core/policies/policy-cancellation-attempts.service';
import { POLICY_CANCELLATION_GATEWAY } from '../../core/policies/policy-cancellation.gateway';
import {
  CANCELLATION_REASONS,
  CancellationAttempt,
  CancellationErrorKind,
  CancellationReason,
  CancellationState,
  PolicyCancellationError,
} from '../../core/policies/policy-cancellation.models';
import { POLICY_ID_PATTERN } from '../../core/policies/policy-renewal.models';

type LoadState = 'loading' | 'ready' | 'invalid' | 'session' | 'error';
type Notice = CancellationErrorKind | 'load' | 'ambiguous' | 'storage';

@Component({
  selector: 'app-policy-cancellation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './policy-cancellation-page.component.html',
  styleUrl: './policy-cancellation-page.component.scss',
})
export class PolicyCancellationPageComponent implements OnInit {
  private readonly gateway = inject(POLICY_CANCELLATION_GATEWAY);
  private readonly attempts = inject(PolicyCancellationAttempts);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly user = toObservable(this.auth.user);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);
  private request?: Subscription;
  private ownerId: string | null = null;

  readonly policyId = signal<string | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly cancellation = signal<CancellationState | null>(null);
  readonly reason = signal<CancellationReason | null>(null);
  readonly confirmed = signal(false);
  readonly busy = signal(false);
  readonly notice = signal<Notice | null>(null);
  readonly pending = signal<CancellationAttempt | null>(null);
  readonly blocked = signal(false);
  readonly reasons = CANCELLATION_REASONS;
  readonly result = computed(() => this.cancellation()?.cancellation ?? null);
  readonly settlement = computed(
    () => this.result()?.settlement ?? (this.pending() ? null : this.cancellation()?.settlement),
  );
  readonly canConfirm = computed(
    () =>
      this.state() === 'ready' &&
      !!this.cancellation()?.cancellable &&
      !!this.settlement() &&
      !!this.reason() &&
      this.confirmed() &&
      !this.pending() &&
      !this.busy() &&
      !this.blocked(),
  );

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.user])
      .pipe(
        map(([params, user]) => ({
          policyId: params.get('policyId'),
          ownerId: user?.id ?? null,
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.policyId === current.policyId && previous.ownerId === current.ownerId,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ policyId, ownerId }) => {
        this.request?.unsubscribe();
        this.ownerId = ownerId;
        this.policyId.set(policyId !== null && POLICY_ID_PATTERN.test(policyId) ? policyId : null);
        this.cancellation.set(null);
        this.pending.set(null);
        this.notice.set(null);
        this.reason.set(null);
        this.confirmed.set(false);
        this.blocked.set(false);
        if (!ownerId) {
          this.state.set('session');
        } else if (!this.policyId()) {
          this.state.set('invalid');
        } else {
          this.load();
        }
      });
  }

  load(): void {
    const policyId = this.policyId();
    const ownerId = this.ownerId;
    if (!policyId || !ownerId || this.busy() || this.auth.user()?.id !== ownerId) return;
    this.request?.unsubscribe();
    this.confirmed.set(false);
    this.cancellation.set(null);
    this.state.set('loading');
    this.blocked.set(false);
    try {
      const pending = this.attempts.read(ownerId, policyId);
      this.pending.set(pending);
      this.reason.set(pending?.reason ?? null);
      if (this.notice() === 'storage') this.notice.set(null);
    } catch (error) {
      this.storageError(error);
    }
    this.request = this.gateway
      .state(policyId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.cancellation.set(value);
          this.state.set('ready');
          if (value.cancellation) {
            this.notice.set(null);
            this.clearAttempt();
            this.dashboard.load();
          } else if (this.notice() === 'load') {
            this.notice.set(null);
          }
        },
        error: (error: unknown) => {
          if (!(error instanceof PolicyCancellationError)) {
            console.error('Policy cancellation state could not be loaded.', error);
          }
          this.notice.set(error instanceof PolicyCancellationError ? error.kind : 'load');
          this.state.set('error');
        },
      });
  }

  selectReason(reason: CancellationReason): void {
    if (this.pending() || this.busy() || !this.reasons.includes(reason)) return;
    this.reason.set(reason);
    this.confirmed.set(false);
  }

  confirm(): void {
    const policyId = this.policyId();
    const ownerId = this.ownerId;
    if (
      !policyId ||
      !ownerId ||
      this.state() !== 'ready' ||
      this.auth.user()?.id !== ownerId ||
      this.busy() ||
      this.blocked()
    ) {
      return;
    }
    let attempt = this.pending();
    if (!attempt) {
      const reason = this.reason();
      const settlement = this.settlement();
      if (!this.canConfirm() || !reason || !settlement) return;
      attempt = { key: crypto.randomUUID(), reason, settlementHash: settlement.settlementHash };
    }
    try {
      const saved = this.attempts.read(ownerId, policyId);
      if (
        saved &&
        (saved.key !== attempt.key ||
          saved.reason !== attempt.reason ||
          saved.settlementHash !== attempt.settlementHash)
      ) {
        throw new Error('The saved cancellation attempt changed. Reload before continuing.');
      }
      this.attempts.save(ownerId, policyId, attempt);
    } catch (error) {
      this.storageError(error);
      return;
    }
    this.pending.set(attempt);
    this.notice.set(null);
    this.busy.set(true);
    this.request = this.gateway
      .cancel(policyId, attempt)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          const current = this.cancellation();
          if (!current) return;
          this.cancellation.set({
            ...current,
            state: 'cancelada',
            cancellable: false,
            reason: 'poliza_cancelada',
            settlement: null,
            cancellation: result,
          });
          this.confirmed.set(false);
          this.clearAttempt();
          this.dashboard.load();
        },
        error: (error: unknown) => {
          if (error instanceof PolicyCancellationError) {
            this.notice.set(error.kind);
            if (['settlement-changed', 'not-cancellable'].includes(error.kind)) {
              this.clearAttempt();
              this.busy.set(false);
              this.load();
            } else {
              this.blocked.set(true);
            }
          } else {
            console.error('Policy cancellation was not confirmed.', error);
            this.notice.set('ambiguous');
          }
        },
      });
  }

  money(amount: string): string {
    return new Intl.NumberFormat(this.dateLocale, {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(BigInt(amount));
  }

  private clearAttempt(): void {
    const policyId = this.policyId();
    const ownerId = this.ownerId;
    if (!policyId || !ownerId) return;
    try {
      this.attempts.clear(ownerId, policyId);
      this.pending.set(null);
    } catch (error) {
      this.storageError(error);
    }
  }

  private storageError(error: unknown): void {
    console.error('Policy cancellation recovery could not be preserved.', error);
    this.notice.set('storage');
    this.blocked.set(true);
  }
}

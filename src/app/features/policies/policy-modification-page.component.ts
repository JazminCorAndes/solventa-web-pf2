import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { MatRadioModule } from '@angular/material/radio';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { POLICY_MODIFICATION_GATEWAY } from '../../core/policies/policy-modification.gateway';
import {
  ModificationErrorKind,
  ModificationImpact,
  ModificationProposal,
  ModificationResult,
  ModificationState,
  NotModifiableReason,
  Plan,
  PolicyModificationError,
} from '../../core/policies/policy-modification.models';
import { POLICY_ID_PATTERN } from '../../core/policies/policy-renewal.models';

type LoadState = 'loading' | 'ready' | 'not-found' | 'invalid' | 'error';
type Outcome =
  | { kind: 'confirmed'; result: ModificationResult }
  | { kind: 'rejected'; error: ModificationErrorKind; reason: NotModifiableReason | null }
  | { kind: 'simulation-failed' }
  | { kind: 'unconfirmed' };

@Component({
  selector: 'app-policy-modification-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './policy-modification-page.component.html',
  styleUrl: './policy-modification-page.component.scss',
})
export class PolicyModificationPageComponent implements OnInit {
  private readonly gateway = inject(POLICY_MODIFICATION_GATEWAY);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);

  readonly policyId = signal<string | null>(null);
  readonly state = signal<LoadState>('loading');
  readonly modification = signal<ModificationState | null>(null);
  readonly plan = signal<Plan | null>(null);
  readonly optionals = signal<ReadonlySet<string>>(new Set());
  readonly impact = signal<ModificationImpact | null>(null);
  readonly confirmed = signal(false);
  readonly busy = signal(false);
  readonly outcome = signal<Outcome | null>(null);
  /** Clave reutilizada solo para reconsultar una confirmacion cuyo resultado no se conocio. */
  private pending: { impactHash: string; key: string } | null = null;

  readonly changed = computed(() => {
    const current = this.modification()?.currentVersion;
    if (!current) {
      return false;
    }
    const included = current.coverages
      .filter((coverage) => coverage.optional && coverage.included)
      .map((coverage) => coverage.code);
    const selected = this.optionals();
    return (
      this.plan() !== current.plan ||
      included.length !== selected.size ||
      included.some((code) => !selected.has(code))
    );
  });

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const policyId = params.get('policyId');
      this.outcome.set(null);
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
    this.gateway
      .state(policyId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (modification) => {
          this.applyState(modification);
          this.state.set('ready');
        },
        error: (error: unknown) => {
          if (error instanceof PolicyModificationError && error.kind === 'not-found') {
            this.state.set('not-found');
            return;
          }
          console.error('Policy modification state could not be loaded.', error);
          this.state.set('error');
        },
      });
  }

  selectPlan(plan: Plan): void {
    this.plan.set(plan);
    this.invalidateImpact();
  }

  toggleOptional(code: string, checked: boolean): void {
    const next = new Set(this.optionals());
    if (checked) {
      next.add(code);
    } else {
      next.delete(code);
    }
    this.optionals.set(next);
    this.invalidateImpact();
  }

  simulate(): void {
    const policyId = this.policyId();
    const proposal = this.proposal();
    if (!policyId || !proposal || this.busy() || !this.changed()) {
      return;
    }
    this.busy.set(true);
    this.outcome.set(null);
    this.gateway
      .simulate(policyId, proposal)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (impact) => this.impact.set(impact),
        error: (error: unknown) => this.handleError(error, 'simulation-failed'),
      });
  }

  toggleConfirmation(checked: boolean): void {
    this.confirmed.set(checked);
  }

  confirm(): void {
    const policyId = this.policyId();
    const proposal = this.proposal();
    const impact = this.impact();
    if (!policyId || !proposal || !impact || this.busy() || !this.confirmed()) {
      return;
    }
    const key =
      this.pending?.impactHash === impact.impactHash ? this.pending.key : crypto.randomUUID();
    this.pending = { impactHash: impact.impactHash, key };
    this.busy.set(true);
    this.outcome.set(null);
    this.gateway
      .confirm(policyId, proposal, impact.impactHash, key)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.pending = null;
          const current = this.modification();
          if (current) {
            this.applyState({
              ...current,
              currentVersion: result.version,
              history: [result.version, ...current.history],
            });
          }
          this.outcome.set({ kind: 'confirmed', result });
        },
        error: (error: unknown) => this.handleError(error, 'unconfirmed'),
      });
  }

  amount(value: string): number {
    return Number(value);
  }

  coverageName(code: string): string {
    return (
      this.modification()?.currentVersion?.coverages.find((coverage) => coverage.code === code)
        ?.name ?? code
    );
  }

  private proposal(): ModificationProposal | null {
    const current = this.modification()?.currentVersion;
    const plan = this.plan();
    return current && plan
      ? { baseVersion: current.version, plan, optionalCoverages: [...this.optionals()].sort() }
      : null;
  }

  private applyState(modification: ModificationState): void {
    this.modification.set(modification);
    const current = modification.currentVersion;
    this.plan.set(current?.plan ?? null);
    this.optionals.set(
      new Set(
        current?.coverages
          .filter((coverage) => coverage.optional && coverage.included)
          .map((coverage) => coverage.code) ?? [],
      ),
    );
    this.invalidateImpact();
  }

  private invalidateImpact(): void {
    this.impact.set(null);
    this.confirmed.set(false);
  }

  private handleError(error: unknown, technical: 'simulation-failed' | 'unconfirmed'): void {
    if (error instanceof PolicyModificationError) {
      this.pending = null;
      this.outcome.set({ kind: 'rejected', error: error.kind, reason: error.reason });
      if (['outdated-version', 'impact-changed', 'not-modifiable'].includes(error.kind)) {
        this.load();
      } else {
        this.invalidateImpact();
      }
      return;
    }
    console.error('Policy modification was not completed.', error);
    this.outcome.set({ kind: technical });
  }
}

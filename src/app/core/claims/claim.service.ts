import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import { defer, finalize, Subject, takeUntil } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CLAIM_GATEWAY } from './claim.gateway';
import {
  CLAIM_UUID,
  ClaimAttempt,
  ClaimInput,
  ClaimPolicy,
  ClaimRecord,
  eventWithinPolicy,
  isClaimInput,
  sameClaimInput,
} from './claim.models';

@Injectable({ providedIn: 'root' })
export class ClaimService implements OnDestroy {
  private readonly gateway = inject(CLAIM_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly cancelled = new Subject<void>();
  private readonly owner = signal<string | null>(null);
  private readonly attemptState = signal<ClaimAttempt | null>(null);
  private readonly recordState = signal<ClaimRecord | null>(null);
  private readonly policyState = signal<ClaimPolicy[]>([]);
  private readonly scopeMatches = computed(() => this.owner() === this.auth.user()?.id);

  readonly attempt = computed(() => (this.scopeMatches() ? this.attemptState() : null));
  readonly record = computed(() => (this.scopeMatches() ? this.recordState() : null));
  readonly policies = computed(() => (this.scopeMatches() ? this.policyState() : []));
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly policyError = signal<string | null>(null);
  readonly locked = computed(
    () => !!this.attempt() || this.submitting() || this.errorKey() === 'claims.errors.storage',
  );

  constructor() {
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      if (this.owner() !== owner) untracked(() => this.reset());
    });
  }

  ngOnDestroy(): void {
    this.cancelled.next();
    this.cancelled.complete();
  }

  load(): void {
    this.reset();
    this.owner.set(this.auth.user()?.id ?? null);
    if (!this.owner() || this.auth.user()?.role !== 'client') {
      this.errorKey.set('claims.errors.session');
      return;
    }
    try {
      const stored: unknown = JSON.parse(this.storage.getItem(this.storageKey) ?? 'null');
      if (stored !== null) {
        if (!isAttempt(stored)) throw new ClaimStorageError();
        this.attemptState.set(stored);
      }
    } catch (error) {
      if (!isStorageError(error)) throw error;
      this.errorKey.set('claims.errors.storage');
    }
    this.loadPolicies();
    const attempt = this.attempt();
    if (attempt?.claimId) {
      this.submitting.set(true);
      this.gateway
        .load(attempt.claimId)
        .pipe(
          takeUntil(this.cancelled),
          finalize(() => this.submitting.set(false)),
        )
        .subscribe({
          next: (record) => this.accept(record, attempt),
          error: (error: unknown) => this.errorKey.set(errorKey(error)),
        });
    }
  }

  loadPolicies(): void {
    if (this.loading() || !this.scopeMatches()) return;
    this.loading.set(true);
    this.policyError.set(null);
    this.gateway
      .policies()
      .pipe(
        takeUntil(this.cancelled),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (policies) => this.policyState.set(policies),
        error: () => this.policyError.set('claims.errors.policies'),
      });
  }

  report(input: ClaimInput): void {
    if (this.submitting() || this.record() || !this.scopeMatches()) return;
    if (!this.owner() || this.auth.user()?.role !== 'client') {
      this.errorKey.set('claims.errors.session');
      return;
    }
    if (this.errorKey() === 'claims.errors.storage') return;
    let attempt = this.attempt();
    if (!attempt) {
      if (!isClaimInput(input) || !this.validEvent(input)) {
        this.errorKey.set('claims.errors.invalid');
        return;
      }
      attempt = { key: crypto.randomUUID(), payload: { ...input } };
    }
    const currentAttempt = attempt;
    this.submitting.set(true);
    this.errorKey.set(null);
    defer(() => {
      // Persist before sending: an interrupted response must keep the original operation.
      this.storage.setItem(this.storageKey, JSON.stringify(currentAttempt));
      this.attemptState.set(currentAttempt);
      return this.gateway.report(currentAttempt.payload, currentAttempt.key);
    })
      .pipe(
        takeUntil(this.cancelled),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
        next: (record) => this.accept(record, currentAttempt),
        error: (error: unknown) => {
          if (isStorageError(error)) {
            this.errorKey.set('claims.errors.storage');
            return;
          }
          if (!currentAttempt.claimId && isDefinitiveRejection(error)) {
            try {
              this.storage.removeItem(this.storageKey);
              this.attemptState.set(null);
            } catch (storageError) {
              if (!isStorageError(storageError)) throw storageError;
              this.errorKey.set('claims.errors.storage');
              return;
            }
          }
          this.errorKey.set(errorKey(error));
        },
      });
  }

  retry(): void {
    const attempt = this.attempt();
    if (attempt) this.report(attempt.payload);
  }

  newReport(): void {
    if (!this.record() || this.submitting()) return;
    try {
      this.storage.removeItem(this.storageKey);
    } catch (error) {
      if (!isStorageError(error)) throw error;
      this.errorKey.set('claims.errors.storage');
      return;
    }
    this.attemptState.set(null);
    this.recordState.set(null);
    this.errorKey.set(null);
    this.loadPolicies();
  }

  private validEvent(input: ClaimInput): boolean {
    const policy = this.policies().find((item) => item.id === input.polizaId);
    return eventWithinPolicy(policy, new Date(input.fechaEvento));
  }

  private accept(record: ClaimRecord, attempt: ClaimAttempt): void {
    if (
      !sameClaimInput(record, attempt.payload) ||
      (attempt.claimId !== undefined && attempt.claimId !== record.id)
    ) {
      this.errorKey.set('claims.errors.response');
      return;
    }
    try {
      const confirmed = { ...attempt, claimId: record.id };
      this.storage.setItem(this.storageKey, JSON.stringify(confirmed));
      this.attemptState.set(confirmed);
    } catch (error) {
      if (!isStorageError(error)) throw error;
      this.errorKey.set('claims.errors.storage');
      return;
    }
    this.errorKey.set(null);
    this.recordState.set(record);
  }

  private get storage(): Storage {
    const storage = this.document.defaultView?.sessionStorage;
    if (!storage) throw new ClaimStorageError();
    return storage;
  }

  private get storageKey(): string {
    return `solventa.claim-attempt.${this.owner()}`;
  }

  private reset(): void {
    this.cancelled.next();
    this.owner.set(null);
    this.attemptState.set(null);
    this.recordState.set(null);
    this.policyState.set([]);
    this.errorKey.set(null);
    this.policyError.set(null);
    this.loading.set(false);
    this.submitting.set(false);
  }
}

class ClaimStorageError extends Error {}

function isStorageError(error: unknown): boolean {
  return (
    error instanceof ClaimStorageError ||
    error instanceof DOMException ||
    error instanceof SyntaxError
  );
}

function isAttempt(value: unknown): value is ClaimAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<ClaimAttempt>;
  return (
    typeof attempt.key === 'string' &&
    CLAIM_UUID.test(attempt.key) &&
    isClaimInput(attempt.payload) &&
    (attempt.claimId === undefined ||
      (typeof attempt.claimId === 'string' && CLAIM_UUID.test(attempt.claimId)))
  );
}

function isDefinitiveRejection(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 400 ||
      error.status === 404 ||
      (error.status === 409 && error.error?.code === 'poliza_no_vigente'))
  );
}

function errorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'claims.errors.session';
    if (error.status === 403) return 'claims.errors.forbidden';
    if (error.status === 400) return 'claims.errors.invalid';
    if (error.status === 404) return 'claims.errors.notFound';
    if (error.status === 409) {
      return error.error?.code === 'poliza_no_vigente'
        ? 'claims.errors.policyExpired'
        : 'claims.errors.conflict';
    }
  }
  return 'claims.errors.unconfirmed';
}

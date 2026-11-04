import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ClaimNotFoundError } from './claim-status.errors';
import { CLAIM_STATUS_GATEWAY } from './claim-status.gateway';
import { ClaimStatus } from './claim-status.models';

type ClaimStatusState = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

@Injectable({ providedIn: 'root' })
export class ClaimStatusService {
  private readonly gateway = inject(CLAIM_STATUS_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ownerId = signal<string | null>(null);
  private readonly claimId = signal<string | null>(null);
  private request?: Subscription;
  private readonly claimState = signal<ClaimStatus | null>(null);
  private readonly statusState = signal<ClaimStatusState>('idle');

  readonly claim = computed(() =>
    this.ownerId() === this.auth.user()?.id ? this.claimState() : null,
  );
  readonly status = computed(() =>
    this.ownerId() === this.auth.user()?.id ? this.statusState() : 'idle',
  );

  constructor() {
    effect(() => {
      const ownerId = this.auth.user()?.id ?? null;
      untracked(() => {
        if (this.ownerId() !== ownerId) {
          this.reset(ownerId, null);
        }
      });
    });
  }

  /**
   * Cada consulta descarta el resultado anterior antes de pedir uno nuevo, de modo que
   * un fallo nunca deja visible un estado antiguo como si estuviera actualizado.
   */
  load(claimId: string): void {
    const ownerId = this.auth.user()?.id ?? null;
    this.reset(ownerId, claimId);
    if (!ownerId) {
      return;
    }

    this.statusState.set('loading');
    this.request = this.gateway
      .load(claimId)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.isCurrent(ownerId, claimId) && this.statusState() === 'loading') {
            this.statusState.set('error');
          }
        }),
      )
      .subscribe({
        next: (claim) => {
          if (!this.isCurrent(ownerId, claimId)) {
            return;
          }
          this.claimState.set(claim);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          if (!this.isCurrent(ownerId, claimId)) {
            return;
          }
          if (error instanceof ClaimNotFoundError) {
            this.statusState.set('not-found');
            return;
          }
          console.error('Claim status could not be loaded.', error);
          this.statusState.set('error');
        },
      });
  }

  private isCurrent(ownerId: string, claimId: string): boolean {
    return this.auth.user()?.id === ownerId && this.claimId() === claimId;
  }

  private reset(ownerId: string | null, claimId: string | null): void {
    this.request?.unsubscribe();
    this.ownerId.set(ownerId);
    this.claimId.set(claimId);
    this.claimState.set(null);
    this.statusState.set('idle');
  }
}

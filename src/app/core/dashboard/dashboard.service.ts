import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_GATEWAY } from './dashboard.gateway';
import { DashboardSnapshot } from './dashboard.models';

type DashboardStatus = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly gateway = inject(DASHBOARD_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ownerId = signal<string | null>(null);
  private request?: Subscription;
  private readonly snapshotState = signal<DashboardSnapshot | null>(null);
  private readonly statusState = signal<DashboardStatus>('idle');

  readonly snapshot = computed(() =>
    this.ownerId() === this.auth.user()?.id ? this.snapshotState() : null,
  );
  readonly status = computed(() =>
    this.ownerId() === this.auth.user()?.id ? this.statusState() : 'idle',
  );

  constructor() {
    effect(() => {
      const ownerId = this.auth.user()?.id ?? null;
      untracked(() => this.synchronizeOwner(ownerId));
    });
  }

  load(): void {
    const ownerId = this.auth.user()?.id ?? null;
    this.synchronizeOwner(ownerId);
    if (!ownerId) {
      return;
    }
    if (this.statusState() === 'loading') {
      return;
    }

    this.statusState.set('loading');
    this.snapshotState.set(null);
    this.request = this.gateway
      .load()
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.ownerId() === ownerId && this.statusState() === 'loading') {
            this.statusState.set('error');
          }
        }),
      )
      .subscribe({
        next: (snapshot) => {
          if (this.auth.user()?.id !== ownerId) {
            return;
          }
          this.snapshotState.set(snapshot);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          console.error('Dashboard data could not be loaded.', error);
          if (this.auth.user()?.id === ownerId) {
            this.statusState.set('error');
          }
        },
      });
  }

  private synchronizeOwner(ownerId: string | null): void {
    if (this.ownerId() === ownerId) {
      return;
    }
    this.request?.unsubscribe();
    this.ownerId.set(ownerId);
    this.snapshotState.set(null);
    this.statusState.set('idle');
  }
}

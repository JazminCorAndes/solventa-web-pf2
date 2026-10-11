import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, take } from 'rxjs';
import { DASHBOARD_GATEWAY } from './dashboard.gateway';
import { DashboardSnapshot } from './dashboard.models';

type DashboardStatus = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly gateway = inject(DASHBOARD_GATEWAY);
  private readonly snapshotState = signal<DashboardSnapshot | null>(null);
  private readonly statusState = signal<DashboardStatus>('idle');

  readonly snapshot = this.snapshotState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly activePolicies = computed(
    () => this.snapshotState()?.policies.filter((policy) => policy.status === 'active').length ?? 0,
  );
  readonly unreadNotifications = computed(
    () =>
      this.snapshotState()?.notifications.filter((notification) => !notification.read).length ?? 0,
  );

  load(): void {
    if (this.statusState() === 'loading') {
      return;
    }

    this.statusState.set('loading');
    this.gateway
      .load()
      .pipe(
        take(1),
        finalize(() => {
          if (this.statusState() === 'loading') {
            this.statusState.set('ready');
          }
        }),
      )
      .subscribe({
        next: (snapshot) => {
          this.snapshotState.set(snapshot);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          console.error('Dashboard data could not be loaded.', error);
          this.statusState.set('error');
        },
      });
  }
}

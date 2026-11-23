import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize, forkJoin, map, of, Subscription, switchMap, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CLAIM_GATEWAY } from '../../core/claims/claim.gateway';
import { CLAIM_UUID, ClaimRecord } from '../../core/claims/claim.models';
import { CLAIM_STATUS_GATEWAY } from '../../core/claims/claim-status.gateway';
import { ClaimState } from '../../core/claims/claim-status.models';

type ListStatus = 'loading' | 'ready' | 'error' | 'forbidden' | 'session';
type ClaimListItem = ClaimRecord & { currentState: ClaimState };

@Component({
  selector: 'app-claim-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './claim-list-page.component.html',
  styleUrl: './claim-list-page.component.scss',
})
export class ClaimListPageComponent {
  private readonly gateway = inject(CLAIM_GATEWAY);
  private readonly statusGateway = inject(CLAIM_STATUS_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);
  private readonly ownerId = signal<string | null>(null);
  private readonly records = signal<ClaimListItem[]>([]);
  private readonly listStatus = signal<ListStatus>('loading');
  private request?: Subscription;

  readonly claims = computed(() => (this.isOwner() ? this.records() : []));
  readonly status = computed(() => (this.isOwner() ? this.listStatus() : 'session'));
  readonly lookup = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(CLAIM_UUID)],
  });
  readonly lookupForm = new FormGroup({ claimId: this.lookup });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.load(user?.role === 'client' ? user.id : null));
    });
  }

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  refresh(): void {
    const user = this.auth.user();
    this.load(user?.role === 'client' ? user.id : null);
  }

  search(): void {
    this.lookup.setValue(this.lookup.value.trim());
    if (this.lookup.invalid) {
      this.lookup.markAsTouched();
      return;
    }
    void this.router.navigate(['/app/siniestros', this.lookup.value]);
  }

  private isOwner(): boolean {
    const user = this.auth.user();
    return !!user && user.role === 'client' && user.id === this.ownerId();
  }

  private load(ownerId: string | null): void {
    this.request?.unsubscribe();
    this.ownerId.set(ownerId);
    this.records.set([]);
    this.lookup.reset();
    this.listStatus.set('loading');
    if (!ownerId) return;

    this.request = this.gateway
      .list()
      .pipe(
        switchMap((records) =>
          records.length
            ? forkJoin(
                records.map((record) =>
                  this.statusGateway.load(record.id).pipe(
                    map((status): ClaimListItem => {
                      if (status.id !== record.id || status.policyId !== record.polizaId) {
                        throw new Error('Claim status does not match the listed report.');
                      }
                      return { ...record, currentState: status.state };
                    }),
                  ),
                ),
              )
            : of([] as ClaimListItem[]),
        ),
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.isOwner() && this.listStatus() === 'loading') {
            this.listStatus.set('error');
          }
        }),
      )
      .subscribe({
        next: (records) => {
          if (!this.isOwner()) return;
          this.records.set(records);
          this.listStatus.set('ready');
        },
        error: (error: unknown) => {
          if (!this.isOwner()) return;
          if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
            this.listStatus.set(error.status === 403 ? 'forbidden' : 'session');
            return;
          }
          console.error('Claim list could not be loaded.', error);
          this.listStatus.set('error');
        },
      });
  }
}

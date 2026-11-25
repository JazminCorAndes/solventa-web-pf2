import { DOCUMENT, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subject, finalize, forkJoin, map, takeUntil } from 'rxjs';
import { ADMINISTRATION_GATEWAY } from '../../core/administration/administration.gateway';
import {
  AdministrativeClaim,
  AdministrativeEvidence,
  isReviewQueue,
  ReviewHistory,
  ReviewQueueItem,
  ReviewResult,
} from '../../core/administration/administration.models';
import {
  ReviewAttempt,
  ReviewAttemptsService,
} from '../../core/administration/review-attempts.service';
import { AuthService } from '../../core/auth/auth.service';
import { canReviewClaims } from '../../core/auth/auth.models';
import { CLAIM_UUID } from '../../core/claims/claim.models';

@Component({
  selector: 'app-administration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './administration-page.component.html',
  styleUrl: './administration-page.component.scss',
})
export class AdministrationPageComponent {
  private readonly gateway = inject(ADMINISTRATION_GATEWAY);
  private readonly auth = inject(AuthService);
  private readonly attempts = inject(ReviewAttemptsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly administratorId = computed(() => {
    const user = this.auth.user();
    return user && canReviewClaims(user) ? user.id : null;
  });
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly version = signal(0);
  private readonly contextEnded = new Subject<void>();
  private context = '';

  readonly claimId = computed(() => this.params()?.get('claimId') ?? null);
  readonly portalPath = computed(() =>
    this.auth.user()?.role === 'advisor' ? '/asesor' : '/administracion',
  );
  readonly queue = computed(() => this.params()?.get('queue') ?? null);
  readonly items = signal<ReviewQueueItem[]>([]);
  readonly claim = signal<AdministrativeClaim | null>(null);
  readonly history = signal<ReviewHistory | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly downloading = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly decisionError = signal<string | null>(null);
  readonly downloadError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly pending = signal<ReviewAttempt | null>(null);
  readonly canDecide = computed(() => {
    const history = this.history();
    const assignment = history?.asignacionActiva;
    return (
      canReviewClaims(this.auth.user()) &&
      !this.loading() &&
      !this.loadError() &&
      !this.submitting() &&
      !this.pending() &&
      history?.estado === 'en_revision' &&
      assignment?.tipo === 'cola' &&
      assignment.destino === 'revision' &&
      assignment.estado === 'activa'
    );
  });
  readonly form = inject(FormBuilder).nonNullable.group({
    resultado: ['aprobado' as ReviewResult, Validators.required],
    motivo: [
      '',
      [
        Validators.required,
        Validators.maxLength(1000),
        (control: AbstractControl) =>
          typeof control.value === 'string' && control.value.trim().length >= 10
            ? null
            : { reasonLength: true },
      ],
    ],
  });

  constructor() {
    effect((onCleanup) => {
      const ownerId = this.administratorId();
      const id = this.claimId();
      const queue = this.queue();
      this.version();
      const context = JSON.stringify([ownerId, this.auth.user()?.role, id, queue]);
      if (context !== this.context) {
        this.context = context;
        this.saved.set(false);
        this.decisionError.set(null);
        this.downloadError.set(null);
        this.form.reset({ resultado: 'aprobado', motivo: '' });
      }
      this.contextEnded.next();
      this.submitting.set(false);
      this.downloading.set(null);
      this.claim.set(null);
      this.history.set(null);
      this.items.set([]);
      this.loadError.set(null);
      const pending = ownerId && id ? this.attempts.get(ownerId, id) : null;
      this.pending.set(pending);
      if (pending) this.form.setValue(pending.input);
      this.loading.set(false);
      if (!ownerId) {
        this.loadError.set('forbidden');
        return;
      }
      const selectedQueue = isReviewQueue(queue) ? queue : null;
      if ((id && !CLAIM_UUID.test(id)) || (!id && !selectedQueue)) {
        this.loadError.set('invalid');
        return;
      }
      this.loading.set(true);
      const request: Observable<
        { claim: AdministrativeClaim; history: ReviewHistory } | { items: ReviewQueueItem[] }
      > = id
        ? forkJoin({ claim: this.gateway.claim(id), history: this.gateway.history(id) })
        : this.gateway.queue(selectedQueue!).pipe(map((items) => ({ items })));
      const subscription = request.pipe(finalize(() => this.loading.set(false))).subscribe({
        next: (result) => {
          if ('items' in result) this.items.set(result.items);
          else {
            this.claim.set(result.claim);
            this.history.set(result.history);
            if (
              pending &&
              result.history.decisiones.some((item) => item.operacionId === pending.key)
            ) {
              this.attempts.clear(ownerId, id!);
              this.pending.set(null);
              this.saved.set(true);
              this.decisionError.set(null);
            }
          }
        },
        error: (error: unknown) => this.loadError.set(errorKey(error)),
      });
      onCleanup(() => {
        subscription.unsubscribe();
        this.contextEnded.next();
      });
    });
  }

  reload(): void {
    if (!this.submitting()) this.version.update((version) => version + 1);
  }

  submit(): void {
    if (!this.canDecide()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const user = this.auth.user();
    const id = this.claimId();
    if (!user || !id) return;
    try {
      const input = this.form.getRawValue();
      const attempt = {
        key: globalThis.crypto.randomUUID(),
        input: { ...input, motivo: input.motivo.trim() },
      };
      this.attempts.set(user.id, id, attempt);
      this.pending.set(attempt);
    } catch (error) {
      console.error('An idempotent review attempt could not be created.', error);
      this.decisionError.set('unavailable');
      return;
    }
    this.retryDecision();
  }

  retryDecision(): void {
    const user = this.auth.user();
    const id = this.claimId();
    const attempt = this.pending();
    if (
      !user ||
      !canReviewClaims(user) ||
      !id ||
      !attempt ||
      this.submitting() ||
      this.loading() ||
      !this.history() ||
      this.loadError()
    )
      return;
    this.submitting.set(true);
    this.decisionError.set(null);
    this.saved.set(false);
    this.gateway
      .decide(id, attempt.input, attempt.key)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntil(this.contextEnded),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (this.administratorId() !== user.id || this.claimId() !== id) return;
          this.attempts.clear(user.id, id);
          this.pending.set(null);
          this.saved.set(true);
          untracked(() => this.version.update((version) => version + 1));
        },
        error: (error: unknown) => {
          if (this.administratorId() !== user.id || this.claimId() !== id) return;
          const definitive =
            error instanceof HttpErrorResponse && [400, 403, 404, 409, 422].includes(error.status);
          if (definitive) {
            this.attempts.clear(user.id, id);
            this.pending.set(null);
            this.history.set(null);
          }
          this.decisionError.set(definitive ? errorKey(error) : 'uncertain');
        },
      });
  }

  download(evidence: AdministrativeEvidence): void {
    const id = this.claimId();
    const ownerId = this.administratorId();
    if (!id || this.downloading() || !canReviewClaims(this.auth.user())) return;
    this.downloadError.set(null);
    this.downloading.set(evidence.id);
    this.gateway
      .content(id, evidence)
      .pipe(
        finalize(() => this.downloading.set(null)),
        takeUntil(this.contextEnded),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (blob) => {
          if (this.administratorId() !== ownerId || this.claimId() !== id) return;
          const url = URL.createObjectURL(blob);
          const link = this.document.createElement('a');
          link.href = url;
          const extension = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'application/pdf': 'pdf',
            'video/mp4': 'mp4',
          }[evidence.mimeType];
          link.download = `${evidence.id}.${extension}`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        error: (error: unknown) => this.downloadError.set(errorKey(error)),
      });
  }
}

function errorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'session';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'notFound';
    if (error.status === 409) return 'conflict';
    if (error.status === 400 || error.status === 422) return 'invalid';
    if (error.status === 429) return 'rateLimited';
  }
  return 'unavailable';
}

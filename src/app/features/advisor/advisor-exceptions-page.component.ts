import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { combineLatest, finalize, map, Observable, Subject, take, takeUntil } from 'rxjs';
import {
  ADVISOR_EXCEPTIONS_GATEWAY,
  AdvisorExceptionsGateway,
} from '../../core/advisor-exceptions/advisor-exceptions.gateway';
import {
  AdvisorException,
  AdvisorExceptionDecision,
  AdvisorExceptionError,
  AdvisorExceptionErrorCode,
  ResolvedAdvisorException,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { isPartnerIds } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';

type ExceptionLoadResult =
  { items: AdvisorException[]; item?: never } | { item: AdvisorException; items?: never };

@Component({
  selector: 'app-advisor-exceptions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './advisor-exceptions-page.component.html',
  styleUrl: './advisor-exceptions-page.component.scss',
})
export class AdvisorExceptionsPageComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gateway: AdvisorExceptionsGateway = inject(ADVISOR_EXCEPTIONS_GATEWAY);
  private readonly formBuilder = inject(FormBuilder);
  private readonly routeState = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([params, query]) => ({
        exceptionId: params.get('exceptionId'),
        requestedSocioId: query.get('socioId'),
      })),
    ),
    { initialValue: { exceptionId: null, requestedSocioId: null } },
  );
  private readonly reloadVersion = signal(0);
  private readonly resolutionAttempted = signal(false);
  private readonly contextInvalidated = new Subject<void>();
  private activeScope: string | null = null;
  private scopeGeneration = 0;

  readonly authorizedPartnerIds = computed(() => {
    const user = this.auth.user();
    return user?.role === 'advisor' && isPartnerIds(user.partnerIds) ? user.partnerIds : [];
  });
  readonly isAdvisor = computed(() => this.auth.user()?.role === 'advisor');
  readonly exceptionId = computed(() => this.routeState().exceptionId);
  readonly requestedSocioId = computed(() => this.routeState().requestedSocioId);
  readonly selectedSocioId = computed(() => {
    const ids = this.authorizedPartnerIds();
    const requested = this.requestedSocioId();
    if (requested !== null) return ids.includes(requested) ? requested : null;
    return ids.length === 1 ? ids[0] : null;
  });
  readonly unauthorizedRequestedSocio = computed(() => {
    const requested = this.requestedSocioId();
    return requested !== null && !this.authorizedPartnerIds().includes(requested);
  });
  readonly loading = signal(false);
  readonly resolving = signal(false);
  readonly exceptions = signal<AdvisorException[]>([]);
  readonly exception = signal<AdvisorException | null>(null);
  readonly resolved = signal<ResolvedAdvisorException | null>(null);
  readonly loadErrorCode = signal<AdvisorExceptionErrorCode | null>(null);
  readonly resolveErrorCode = signal<AdvisorExceptionErrorCode | null>(null);
  readonly reasonForm = this.formBuilder.nonNullable.group({
    motivo: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(500),
        trimmedReasonLength,
      ],
    ],
  });

  constructor() {
    effect((onCleanup) => {
      const socioId = this.selectedSocioId();
      const exceptionId = this.exceptionId();
      const scope = this.scopeKey();
      this.reloadVersion();
      if (scope !== this.activeScope) {
        this.activeScope = scope;
        this.scopeGeneration++;
        this.contextInvalidated.next();
        this.reasonForm.reset();
        this.resolutionAttempted.set(false);
        this.resolveErrorCode.set(null);
        this.resolving.set(false);
      }
      const generation = this.scopeGeneration;
      this.exceptions.set([]);
      this.exception.set(null);
      this.resolved.set(null);
      this.loadErrorCode.set(null);
      if (!socioId) {
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      let request: Observable<ExceptionLoadResult>;
      if (exceptionId) {
        request = this.gateway.get(exceptionId, socioId).pipe(map((item) => ({ item })));
      } else {
        request = this.gateway.list(socioId).pipe(map((items) => ({ items })));
      }
      const subscription = request
        .pipe(
          take(1),
          finalize(() => {
            if (this.isCurrentScope(scope, generation)) this.loading.set(false);
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (result) => {
            if (!this.isCurrentScope(scope, generation)) return;
            if (result.items) this.exceptions.set(result.items);
            else if (result.item) this.exception.set(result.item);
          },
          error: (error: unknown) => {
            if (!this.isCurrentScope(scope, generation)) return;
            this.loadErrorCode.set(errorCode(error));
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  selectSocio(socioId: string): void {
    if (socioId && !this.authorizedPartnerIds().includes(socioId)) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { socioId: socioId || null },
      queryParamsHandling: 'merge',
    });
  }

  retryLoad(): void {
    this.reloadVersion.update((version) => version + 1);
  }

  showReasonError(): boolean {
    const control = this.reasonForm.controls.motivo;
    return control.invalid && (control.touched || this.resolutionAttempted());
  }

  resolve(decision: AdvisorExceptionDecision): void {
    this.resolutionAttempted.set(true);
    this.resolveErrorCode.set(null);
    this.reasonForm.controls.motivo.markAsTouched();
    this.reasonForm.controls.motivo.updateValueAndValidity();
    if (this.reasonForm.invalid || this.resolving()) return;

    const exception = this.exception();
    const socioId = this.selectedSocioId();
    const user = this.auth.user();
    if (
      !exception ||
      exception.estado !== 'pendiente' ||
      exception.excepcionId !== this.exceptionId() ||
      exception.socioId !== socioId ||
      this.activeScope !== this.scopeKey() ||
      !socioId ||
      !user ||
      user.role !== 'advisor' ||
      !isPartnerIds(user.partnerIds) ||
      !user.partnerIds.includes(socioId)
    ) {
      this.resolveErrorCode.set('socio_no_autorizado');
      return;
    }

    const exceptionId = exception.excepcionId;
    const scope = this.scopeKey();
    const generation = this.scopeGeneration;
    const motivo = this.reasonForm.controls.motivo.value.trim();
    this.resolving.set(true);
    this.gateway
      .resolve(exceptionId, socioId, decision, motivo)
      .pipe(
        take(1),
        takeUntil(this.contextInvalidated),
        finalize(() => {
          if (this.isCurrentScope(scope, generation)) this.resolving.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (!this.isCurrentScope(scope, generation)) return;
          this.resolved.set(result);
          this.exception.set(result);
        },
        error: (error: unknown) => {
          if (this.isCurrentScope(scope, generation)) {
            this.resolveErrorCode.set(errorCode(error));
          }
        },
      });
  }

  private scopeKey(): string {
    const user = this.auth.user();
    return JSON.stringify([
      user?.role === 'advisor' ? user.id : null,
      this.selectedSocioId(),
      this.exceptionId(),
    ]);
  }

  private isCurrentScope(scope: string, generation: number): boolean {
    return (
      !this.destroyRef.destroyed && generation === this.scopeGeneration && scope === this.scopeKey()
    );
  }
}

function trimmedReasonLength(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length >= 3
    ? null
    : { trimmedReasonLength: true };
}

function errorCode(error: unknown): AdvisorExceptionErrorCode {
  return error instanceof AdvisorExceptionError ? error.code : 'servicio_no_disponible';
}

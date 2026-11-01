import { DatePipe } from '@angular/common';
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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, Observable, Subject, take, takeUntil } from 'rxjs';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { documentNumberFilter, documentNumberPattern } from '../../core/market/document-number';
import { DocumentType } from '../../core/auth/auth.models';
import {
  clientInformationErrorKey,
  ClientInformationRequest,
  ClientInformationResult,
  HttpClientInformationGateway,
} from '../../data-access/partners/http-client-information.gateway';
import { UUID_PATTERN } from '../../data-access/quotes/http-partner-quote.gateway';
import { InputFilterDirective } from '../../shared/input-filter/input-filter.directive';

interface ConsultationScope {
  context: string;
  generation: number;
  operationId: string;
}

@Component({
  selector: 'app-client-information-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    InputFilterDirective,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <section class="page">
      <header>
        <h1>{{ 'clientInformation.title' | transloco }}</h1>
        <p>{{ 'clientInformation.subtitle' | transloco }}</p>
      </header>

      <mat-card appearance="outlined">
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="identifier-fields">
              <mat-form-field appearance="outline">
                <mat-label>{{ 'clientInformation.searchMode' | transloco }}</mat-label>
                <mat-select formControlName="searchMode">
                  <mat-option value="document">
                    {{ 'clientInformation.searchByDocument' | transloco }}
                  </mat-option>
                  <mat-option value="id">
                    {{ 'clientInformation.searchById' | transloco }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              @if (form.controls.searchMode.value === 'document') {
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clientInformation.documentType' | transloco }}</mat-label>
                  <mat-select formControlName="documentType">
                    @for (type of documentTypes; track type) {
                      <mat-option [value]="type">
                        {{ 'quoteRequest.documentTypes.' + type | transloco }}
                      </mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clientInformation.documentNumber' | transloco }}</mat-label>
                  <input
                    matInput
                    formControlName="documentNumber"
                    autocomplete="off"
                    maxlength="16"
                    [appInputFilter]="documentNumberFilter(form.controls.documentType.value)"
                    [attr.inputmode]="
                      form.controls.documentType.value === 'passport' ? 'text' : 'numeric'
                    "
                  />
                  <mat-hint>{{ 'clientInformation.documentHint' | transloco }}</mat-hint>
                  @if (
                    form.controls.documentNumber.touched && form.controls.documentNumber.invalid
                  ) {
                    <mat-error>{{ 'clientInformation.errors.document' | transloco }}</mat-error>
                  }
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline">
                  <mat-label>{{ 'clientInformation.search' | transloco }}</mat-label>
                  <input
                    matInput
                    formControlName="clienteId"
                    autocomplete="off"
                    [placeholder]="'clientInformation.searchPlaceholder' | transloco"
                  />
                  <mat-hint>{{ 'clientInformation.searchHint' | transloco }}</mat-hint>
                </mat-form-field>
              }
            </div>

            <div class="summary" aria-live="polite">
              <div class="summary-field">
                <span>{{ 'clientInformation.basicData' | transloco }}</span>
                <strong>{{
                  result()?.datos?.['indicadorRiesgo']
                    ? ('clientInformation.data.indicadorRiesgo' | transloco) +
                      ': ' +
                      result()!.datos['indicadorRiesgo']
                    : ('clientInformation.pendingValue' | transloco)
                }}</strong>
              </div>
              <div class="summary-field">
                <span>{{ 'clientInformation.profilingStatus' | transloco }}</span>
                <strong>{{
                  result()
                    ? ('clientInformation.completed' | transloco)
                    : ('clientInformation.pendingValue' | transloco)
                }}</strong>
              </div>
              <div class="summary-field">
                <span>{{ 'clientInformation.currentConsents' | transloco }}</span>
                <strong>{{
                  result()
                    ? ('clientInformation.consentVersion'
                      | transloco: { version: result()!.consentimientoVersion })
                    : ('clientInformation.pendingValue' | transloco)
                }}</strong>
              </div>
            </div>

            @if (result(); as information) {
              <section class="audit-summary">
                <p>
                  {{ 'clientInformation.consultedAt' | transloco }}:
                  {{ information.consultadaEn | date: 'medium' }}
                </p>
                <p>
                  {{ 'clientInformation.evidence' | transloco }}:
                  @for (
                    source of information.evidenciaFuentes;
                    track source.fuente;
                    let last = $last
                  ) {
                    {{ source.fuente }}{{ last ? '' : ', ' }}
                  }
                </p>
              </section>
            }

            <p class="notice">{{ 'clientInformation.minimumDataNotice' | transloco }}</p>
            @if (errorKey(); as key) {
              <p class="error" role="alert">{{ key | transloco }}</p>
            }
            @if (result()) {
              <button mat-flat-button type="button" (click)="newConsultation()">
                {{ 'clientInformation.newConsultation' | transloco }}
              </button>
            } @else {
              <button mat-flat-button type="submit" [disabled]="loading()">
                @if (loading()) {
                  <mat-spinner diameter="20" />
                  {{ 'clientInformation.loading' | transloco }}
                } @else {
                  {{ 'clientInformation.viewDetail' | transloco }}
                }
              </button>
            }
          </form>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: `
    .page {
      display: grid;
      gap: var(--solventa-space-3);
      max-width: 840px;
      margin: 0 auto;
    }
    header h1 {
      margin-bottom: var(--solventa-space-1);
    }
    header p {
      margin: 0;
      color: var(--solventa-color-text-secondary);
    }
    form,
    .summary {
      display: grid;
      gap: var(--solventa-space-3);
    }
    mat-form-field {
      width: 100%;
    }
    .identifier-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--solventa-space-2);
    }
    .summary-field {
      display: grid;
      min-height: 4.25rem;
      padding: var(--solventa-space-3) var(--solventa-space-4);
      border: 1px solid var(--solventa-color-border);
      border-radius: var(--solventa-radius-sm);
      gap: var(--solventa-space-2);
      background: var(--solventa-color-background);
    }
    .summary-field span {
      color: var(--solventa-color-text-secondary);
      font-size: 0.8rem;
    }
    .summary-field strong {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .audit-summary p,
    .notice {
      margin: 0;
      color: var(--solventa-color-text-secondary);
      font-size: 0.88rem;
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
    button mat-spinner {
      display: inline-block;
      margin-right: var(--solventa-space-2);
    }
    button {
      justify-self: start;
    }
  `,
})
export class ClientInformationPageComponent {
  private readonly builder = inject(FormBuilder);
  private readonly gateway = inject(HttpClientInformationGateway);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly contextInvalidated = new Subject<void>();
  private activeContext: string | null = null;
  private routeOperation: string | null | undefined;
  private requestGeneration = 0;
  readonly context = inject(PartnerContextService).context;
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly result = signal<ClientInformationResult | null>(null);
  readonly operationId = signal<string | null>(null);
  readonly documentTypes: readonly DocumentType[] = ['cc', 'ce', 'passport', 'ppt'];
  readonly documentNumberFilter = documentNumberFilter;
  readonly form = this.builder.nonNullable.group({
    searchMode: this.builder.nonNullable.control<'document' | 'id'>('document'),
    documentType: this.builder.nonNullable.control<DocumentType>('cc'),
    documentNumber: [''],
    clienteId: [''],
  });
  readonly partner = computed(() => {
    const partners = this.context()?.socios ?? [];
    const requestedPartner = this.queryParams().get('socio');
    return requestedPartner !== null
      ? (partners.find((partner) => partner.socioId === requestedPartner) ?? null)
      : partners.length === 1
        ? partners[0]
        : null;
  });
  private readonly contextKey = computed(() =>
    JSON.stringify([this.context()?.usuario.id ?? null, this.partner()?.socioId ?? null]),
  );

  constructor() {
    this.form.controls.searchMode.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((mode) => this.configureValidators(mode));
    this.form.controls.documentType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.configureValidators(this.form.controls.searchMode.value));
    this.configureValidators('document');
    effect(() => {
      const context = this.contextKey();
      const partnerId = this.partner()?.socioId ?? null;
      const operationId = this.queryParams().get('operacion');
      untracked(() => this.synchronizeRoute(context, partnerId, operationId));
    });
  }

  private synchronizeRoute(
    context: string,
    partnerId: string | null,
    operationId: string | null,
  ): void {
    const contextChanged = context !== this.activeContext;
    if (!contextChanged && operationId === this.routeOperation) return;
    this.activeContext = context;
    this.routeOperation = operationId;
    // Saving our own operation in the URL must not replace its POST with an early GET.
    if (!contextChanged && operationId === this.operationId()) return;

    this.resetState();
    if (!this.context() || !partnerId) {
      this.errorKey.set('clientInformation.errors.forbidden');
      return;
    }
    if (!operationId) return;
    if (!UUID_PATTERN.test(operationId)) {
      this.errorKey.set('clientInformation.errors.invalid');
      return;
    }
    this.operationId.set(operationId);
    this.form.disable({ emitEvent: false });
    this.run(this.gateway.load(operationId, partnerId), this.requestScope(operationId));
  }

  submit(): void {
    if (this.loading() || this.result()) return;
    this.errorKey.set(null);
    if (
      !this.context() ||
      this.activeContext !== this.contextKey() ||
      this.routeOperation !== this.queryParams().get('operacion')
    ) {
      this.errorKey.set('clientInformation.errors.forbidden');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorKey.set('clientInformation.errors.invalid');
      return;
    }
    const partner = this.partner();
    const productId = partner?.productos[0];
    if (!partner || !productId) {
      this.errorKey.set('clientInformation.errors.forbidden');
      return;
    }
    const values = this.form.getRawValue();
    const identifier =
      values.searchMode === 'document'
        ? {
            tipoDocumento: values.documentType,
            numeroDocumento: values.documentNumber.trim().toUpperCase(),
          }
        : { clienteId: values.clienteId.trim() };
    const operationId = this.operationId() ?? crypto.randomUUID();
    this.operationId.set(operationId);
    this.form.disable({ emitEvent: false });
    this.loading.set(true);
    const scope = this.requestScope(operationId);
    const request: ClientInformationRequest = {
      operationId,
      socioId: partner.socioId,
      ...identifier,
      productoId: productId,
      finalidad: 'cotizacion',
      datosSolicitados: ['indicador_riesgo'],
    };
    void this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: { operacion: operationId, socio: partner.socioId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then((navigated) => {
        if (!this.isCurrentRequest(scope)) return;
        if (navigated) this.run(this.gateway.consult(request), scope);
        else {
          this.loading.set(false);
          this.form.enable({ emitEvent: false });
          this.errorKey.set('clientInformation.errors.unavailable');
        }
      })
      .catch(() => {
        if (!this.isCurrentRequest(scope)) return;
        this.loading.set(false);
        this.form.enable({ emitEvent: false });
        this.errorKey.set('clientInformation.errors.unavailable');
      });
  }

  private run(operation: Observable<ClientInformationResult>, scope: ConsultationScope): void {
    this.loading.set(true);
    operation
      .pipe(
        take(1),
        takeUntil(this.contextInvalidated),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (!this.isCurrentRequest(scope)) return;
          this.loading.set(false);
          if (!this.result()) this.form.enable({ emitEvent: false });
        }),
      )
      .subscribe({
        next: (result) => {
          if (this.isCurrentRequest(scope)) this.result.set(result);
        },
        error: (error: unknown) => {
          if (this.isCurrentRequest(scope)) this.errorKey.set(clientInformationErrorKey(error));
        },
      });
  }

  newConsultation(): void {
    this.resetState();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { operacion: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private resetState(): void {
    this.requestGeneration++;
    this.contextInvalidated.next();
    this.loading.set(false);
    this.result.set(null);
    this.errorKey.set(null);
    this.operationId.set(null);
    this.form.reset(
      {
        searchMode: 'document',
        documentType: 'cc',
        documentNumber: '',
        clienteId: '',
      },
      { emitEvent: false },
    );
    this.configureValidators('document');
    this.form.enable({ emitEvent: false });
  }

  private requestScope(operationId: string): ConsultationScope {
    return {
      context: this.contextKey(),
      generation: this.requestGeneration,
      operationId,
    };
  }

  private isCurrentRequest(scope: ConsultationScope): boolean {
    const operationInUrl = this.queryParams().get('operacion');
    return (
      !this.destroyRef.destroyed &&
      scope.generation === this.requestGeneration &&
      scope.context === this.contextKey() &&
      scope.operationId === this.operationId() &&
      (operationInUrl === scope.operationId || operationInUrl === this.routeOperation)
    );
  }

  private configureValidators(mode: 'document' | 'id'): void {
    const clientId = this.form.controls.clienteId;
    const documentNumber = this.form.controls.documentNumber;
    if (mode === 'document') {
      clientId.clearValidators();
      documentNumber.setValidators([
        Validators.required,
        Validators.pattern(documentNumberPattern(this.form.controls.documentType.value)),
      ]);
    } else {
      documentNumber.clearValidators();
      clientId.setValidators([Validators.required, Validators.pattern(UUID_PATTERN)]);
    }
    clientId.updateValueAndValidity({ emitEvent: false });
    documentNumber.updateValueAndValidity({ emitEvent: false });
  }
}

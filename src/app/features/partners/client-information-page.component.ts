import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import {
  clientInformationErrorKey,
  ClientInformationResult,
  HttpClientInformationGateway,
} from '../../data-access/partners/http-client-information.gateway';
import { UUID_PATTERN } from '../../data-access/quotes/http-partner-quote.gateway';

@Component({
  selector: 'app-client-information-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
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
  readonly context = inject(PartnerContextService).context;
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly result = signal<ClientInformationResult | null>(null);
  readonly operationId = signal<string | null>(null);
  readonly form = this.builder.nonNullable.group({
    clienteId: ['', [Validators.required, Validators.pattern(UUID_PATTERN)]],
  });
  readonly partner = computed(() => {
    const partners = this.context()?.socios ?? [];
    const requestedPartner = this.route.snapshot.queryParamMap.get('socio');
    return (
      partners.find((partner) => partner.socioId === requestedPartner) ??
      (partners.length === 1 ? partners[0] : null)
    );
  });

  submit(): void {
    if (this.loading() || this.result()) return;
    this.errorKey.set(null);
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
    const operationId = this.operationId() ?? crypto.randomUUID();
    this.operationId.set(operationId);
    this.loading.set(true);
    this.form.disable();
    this.gateway
      .consult({
        operationId,
        socioId: partner.socioId,
        clienteId: values.clienteId,
        productoId: productId,
        finalidad: 'cotizacion',
        datosSolicitados: ['indicador_riesgo'],
      })
      .pipe(
        take(1),
        finalize(() => {
          this.loading.set(false);
          if (!this.result()) this.form.enable();
        }),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => this.errorKey.set(clientInformationErrorKey(error)),
      });
  }

  newConsultation(): void {
    this.result.set(null);
    this.errorKey.set(null);
    this.operationId.set(null);
    this.form.reset({ clienteId: '' });
    this.form.enable();
  }
}

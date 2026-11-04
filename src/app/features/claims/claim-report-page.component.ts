import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { eventWithinPolicy } from '../../core/claims/claim.models';
import { ClaimService } from '../../core/claims/claim.service';

const trimmedLength =
  (min: number, max: number): ValidatorFn =>
  (control) =>
    typeof control.value === 'string' &&
    control.value.trim().length >= min &&
    control.value.length <= max
      ? null
      : { length: true };

@Component({
  selector: 'app-claim-report-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './claim-report-page.component.html',
  styleUrl: './claim-report-page.component.scss',
})
export class ClaimReportPageComponent implements OnInit {
  readonly claims = inject(ClaimService);
  private readonly i18n = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);
  private displayedOwner: string | null = null;
  readonly form = this.fb.group({
    polizaId: ['', Validators.required],
    fechaEvento: ['', Validators.required],
    tipoEvento: ['', [trimmedLength(1, 100)]],
    descripcion: ['', [trimmedLength(10, 5000)]],
    lugar: ['', [trimmedLength(1, 300)]],
  });

  constructor() {
    this.form.addValidators(() => {
      const { polizaId, fechaEvento } = this.form.getRawValue();
      if (!polizaId || !fechaEvento) return null;
      const policy = this.claims.policies().find((item) => item.id === polizaId);
      return eventWithinPolicy(policy, new Date(fechaEvento)) ? null : { eventDate: true };
    });
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      if (this.displayedOwner !== owner) {
        this.displayedOwner = owner;
        this.form.reset();
      }
      const attempt = this.claims.attempt();
      if (attempt) {
        this.form.setValue({
          ...attempt.payload,
          fechaEvento: localDateTime(attempt.payload.fechaEvento),
        });
      }
      if (this.claims.locked() || this.claims.loading()) this.form.disable();
      else this.form.enable();
      this.form.updateValueAndValidity();
    });
    effect(() => {
      const policies = this.claims.policies();
      const policyId = this.route.snapshot.queryParamMap.get('polizaId');
      if (!this.form.controls.polizaId.value && policies.some((policy) => policy.id === policyId)) {
        this.form.controls.polizaId.setValue(policyId ?? '');
      }
      this.form.updateValueAndValidity();
    });
  }

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    this.claims.load();
  }

  submit(): void {
    if (this.claims.locked() || this.claims.loading()) return;
    this.form.updateValueAndValidity();
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.claims.report({
      ...value,
      fechaEvento: new Date(value.fechaEvento).toISOString(),
      tipoEvento: value.tipoEvento.trim(),
      descripcion: value.descripcion.trim(),
      lugar: value.lugar.trim(),
    });
  }

  newReport(): void {
    this.claims.newReport();
    if (!this.claims.record()) this.form.reset();
  }
}

function localDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

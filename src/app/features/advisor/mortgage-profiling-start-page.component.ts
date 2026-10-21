import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { AdvisorProfilingService } from '../../core/advisor-profiling/advisor-profiling.service';
import {
  MortgageProfilingError,
  MortgageProfilingErrorCode,
  MortgageProfilingInput,
  MortgageProfilingRecord,
} from '../../core/advisor-profiling/advisor-profiling.models';
import { DocumentType } from '../../core/auth/auth.models';

const PARTNER_ID = 'SOC-CO-001';

@Component({
  selector: 'app-mortgage-profiling-start-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './mortgage-profiling-start-page.component.html',
  styleUrl: './mortgage-profiling-start-page.component.scss',
})
export class MortgageProfilingStartPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly profiling = inject(AdvisorProfilingService);

  readonly processing = signal(false);
  readonly attempted = signal(false);
  readonly errorCode = signal<MortgageProfilingErrorCode | null>(null);
  readonly result = signal<MortgageProfilingRecord | null>(null);
  readonly partnerId = PARTNER_ID;
  readonly form = this.formBuilder.nonNullable.group({
    documentType: this.formBuilder.nonNullable.control<DocumentType>('cc', Validators.required),
    documentNumber: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9]{10,15}$/)]],
    creditReference: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{4,30}$/)]],
    creditAmount: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(1_000_000),
    ]),
    termMonths: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(12),
      Validators.max(360),
    ]),
    consentReference: ['', [Validators.required, Validators.pattern(/^CONS-[A-Za-z0-9-]+$/i)]],
    consentVerified: [false, Validators.requiredTrue],
  });

  submit(): void {
    if (this.processing() || this.result()) {
      return;
    }

    this.attempted.set(true);
    this.errorCode.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.processing.set(true);
    this.form.disable();
    this.profiling
      .start(this.buildInput())
      .pipe(
        take(1),
        finalize(() => {
          this.processing.set(false);
          if (!this.result()) {
            this.form.enable();
          }
        }),
      )
      .subscribe({
        next: (result) => this.result.set(result),
        error: (error: unknown) => {
          console.error('Mortgage profiling could not be started.', error);
          this.errorCode.set(error instanceof MortgageProfilingError ? error.code : 'unexpected');
        },
      });
  }

  startAnother(): void {
    this.profiling.reset();
    this.result.set(null);
    this.errorCode.set(null);
    this.attempted.set(false);
    this.form.reset({
      documentType: 'cc',
      documentNumber: '',
      fullName: '',
      email: '',
      phone: '',
      creditReference: '',
      creditAmount: null,
      termMonths: null,
      consentReference: '',
      consentVerified: false,
    });
    this.form.enable();
  }

  showError(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.attempted());
  }

  private buildInput(): MortgageProfilingInput {
    const value = this.form.getRawValue();
    return {
      partnerId: PARTNER_ID,
      customer: {
        documentType: value.documentType,
        documentNumber: value.documentNumber.trim(),
        fullName: value.fullName.trim(),
        email: value.email.trim().toLowerCase(),
        phone: value.phone.trim(),
      },
      credit: {
        reference: value.creditReference.trim(),
        amount: value.creditAmount ?? 0,
        termMonths: value.termMonths ?? 0,
      },
      consentReference: value.consentReference.trim().toUpperCase(),
    };
  }
}

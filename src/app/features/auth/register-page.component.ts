import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import {
  AuthenticationUnavailableError,
  CredentialEncryptionUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidRegistrationError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { DocumentType } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { documentNumberFilter, documentNumberValidator } from '../../core/market/document-number';
import { BrandComponent } from '../../shared/brand/brand.component';
import { InputFilterDirective } from '../../shared/input-filter/input-filter.directive';

const pastDateValidator: ValidatorFn = (control) => {
  const value: unknown = control.value;
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { pastDate: true };
  }
  const date = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() < today
    ? null
    : { pastDate: true };
};

const matchingPasswords: ValidatorFn = (form) =>
  form.get('password')?.value === form.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };

@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    InputFilterDirective,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './register-page.component.html',
  styleUrls: ['./login-page.component.scss', './register-page.component.scss'],
})
export class RegisterPageComponent {
  private readonly builder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly alert = viewChild<ElementRef<HTMLElement>>('registrationAlert');
  readonly returnUrl = inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl');
  readonly documentTypes: readonly DocumentType[] = ['cc', 'ce', 'passport', 'ppt'];
  readonly documentNumberFilter = documentNumberFilter;
  readonly loading = signal(false);
  readonly completed = signal(false);
  readonly passwordVisible = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly form = this.builder.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      documentType: this.builder.nonNullable.control<DocumentType>('cc', Validators.required),
      documentNumber: ['', [Validators.required, documentNumberValidator('documentType')]],
      phone: ['', [Validators.required, Validators.pattern(/^\+57[0-9]{10}$/)]],
      birthDate: ['', [Validators.required, pastDateValidator]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
      authorized: this.builder.control<boolean | null>(null, Validators.required),
    },
    { validators: matchingPasswords },
  );

  constructor() {
    this.form.controls.documentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.form.controls.documentNumber.updateValueAndValidity());
  }

  submit(): void {
    if (this.loading() || this.completed()) return;
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    this.form.controls.documentNumber.setValue(
      this.form.controls.documentNumber.value.trim().toUpperCase(),
    );
    this.form.controls.phone.setValue(this.form.controls.phone.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const data = this.form.getRawValue();
    if (data.authorized === null) return;
    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable({ emitEvent: false });
    this.auth
      .register({
        name: data.name,
        email: data.email,
        password: data.password,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        phone: data.phone,
        birthDate: data.birthDate,
        consent: { authorized: data.authorized, termsVersion: '1.0' },
      })
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading.set(false);
          this.form.enable({ emitEvent: false });
        }),
      )
      .subscribe({
        next: () => {
          this.completed.set(true);
          this.form.reset();
        },
        error: (error: unknown) => {
          this.errorKey.set(
            error instanceof EmailAlreadyRegisteredError
              ? 'registration.errors.duplicate'
              : error instanceof InvalidRegistrationError
                ? 'registration.errors.invalid'
                : error instanceof TooManyAttemptsError
                  ? 'auth.errors.tooManyAttempts'
                  : error instanceof CredentialEncryptionUnavailableError
                    ? 'registration.errors.encryptionUnavailable'
                    : error instanceof AuthenticationUnavailableError
                      ? 'registration.errors.unavailable'
                      : 'auth.errors.unexpected',
          );
          queueMicrotask(() => this.alert()?.nativeElement.focus());
        },
      });
  }
}

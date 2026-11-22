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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import {
  AuthenticationUnavailableError,
  CredentialEncryptionUnavailableError,
  InvalidRecoveryLinkError,
  InvalidRecoveryRequestError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AuthService } from '../../core/auth/auth.service';
import { RecoveryLinkService } from '../../core/auth/recovery-link.service';
import { BrandComponent } from '../../shared/brand/brand.component';

@Component({
  selector: 'app-password-recovery-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './password-recovery-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class PasswordRecoveryPageComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly alert = viewChild<ElementRef<HTMLElement>>('recoveryAlert');
  readonly reset = inject(ActivatedRoute).snapshot.data['resetPassword'] === true;
  private token = this.reset ? inject(RecoveryLinkService).take() : null;
  readonly invalidLink = signal(this.reset && !this.token);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly passwordVisible = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly form = new FormGroup<{
    password?: FormControl<string>;
    email?: FormControl<string>;
  }>(
    this.reset
      ? {
          password: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
          }),
        }
      : {
          email: new FormControl('', {
            nonNullable: true,
            validators: [Validators.required, Validators.email, Validators.maxLength(254)],
          }),
        },
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.token = null;
      this.form.reset();
    });
  }

  submit(): void {
    if (this.loading() || this.success() || this.invalidLink()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const data = this.form.getRawValue();
    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();
    const operation = this.reset
      ? this.auth.resetPassword(this.token!, data.password!)
      : this.auth.requestPasswordRecovery(data.email!.trim());
    operation
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading.set(false);
          this.form.enable();
        }),
      )
      .subscribe({
        next: () => {
          this.token = null;
          this.form.reset();
          this.success.set(true);
          queueMicrotask(() => this.alert()?.nativeElement.focus());
        },
        error: (error: unknown) => {
          if (error instanceof InvalidRecoveryLinkError) {
            this.token = null;
            this.form.reset();
            this.invalidLink.set(true);
          }
          this.errorKey.set(
            error instanceof InvalidRecoveryLinkError
              ? 'recovery.errors.link'
              : error instanceof InvalidRecoveryRequestError
                ? 'recovery.errors.invalid'
                : error instanceof TooManyAttemptsError
                  ? 'auth.errors.tooManyAttempts'
                  : error instanceof CredentialEncryptionUnavailableError
                    ? 'recovery.errors.encryption'
                    : error instanceof AuthenticationUnavailableError
                      ? 'recovery.errors.unavailable'
                      : 'auth.errors.unexpected',
          );
          queueMicrotask(() => this.alert()?.nativeElement.focus());
        },
      });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import {
  AccessDeniedError,
  AuthenticationUnavailableError,
  InvalidCredentialsError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AuthService } from '../../core/auth/auth.service';
import { safePostLoginUrl } from '../../core/auth/auth.guards';
import { BrandComponent } from '../../shared/brand/brand.component';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alert = viewChild<ElementRef<HTMLElement>>('authAlert');

  readonly loading = signal(false);
  readonly passwordVisible = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit(): void {
    if (this.loading()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorKey.set(null);
    this.form.disable();

    this.auth
      .login(this.form.getRawValue())
      .pipe(
        take(1),
        finalize(() => {
          this.loading.set(false);
          this.form.enable();
        }),
      )
      .subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          void this.router.navigateByUrl(safePostLoginUrl(returnUrl, this.auth.user()));
        },
        error: (error: unknown) => {
          this.errorKey.set(
            error instanceof InvalidCredentialsError
              ? 'auth.errors.invalidCredentials'
              : error instanceof TooManyAttemptsError
                ? 'auth.errors.tooManyAttempts'
                : error instanceof AccessDeniedError
                  ? 'partners.errors.forbidden'
                  : error instanceof AuthenticationUnavailableError
                    ? 'auth.errors.unavailable'
                    : 'auth.errors.unexpected',
          );
          queueMicrotask(() => this.alert()?.nativeElement.focus());
        },
      });
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  showEmailError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  showPasswordError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }
}

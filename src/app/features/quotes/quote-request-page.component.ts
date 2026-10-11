import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import {
  InsuranceProductUnavailableError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';

@Component({
  selector: 'app-quote-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './quote-request-page.component.html',
  styleUrl: './quote-request-page.component.scss',
})
export class QuoteRequestPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);

  readonly quotes = inject(QuoteRequestService);
  readonly consultationDate = new Date();
  readonly submitting = signal(false);
  readonly attempted = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly submittedRequest = signal<QuoteRequestRecord | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    productId: ['', Validators.required],
    customerType: ['natural' as const, Validators.required],
    nationalId: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9.-]{6,20}$/)]],
    vehiclePlate: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{5,8}$/)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9 ]{7,15}$/)]],
  });
  private readonly productId = toSignal(this.form.controls.productId.valueChanges, {
    initialValue: this.form.controls.productId.value,
  });
  readonly selectedProduct = computed(
    () => this.quotes.products().find((product) => product.id === this.productId()) ?? null,
  );

  ngOnInit(): void {
    this.quotes.loadProducts();
  }

  submit(): void {
    if (this.submitting() || this.submittedRequest()) {
      return;
    }

    this.attempted.set(true);
    this.errorKey.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.form.disable();
    const value = this.form.getRawValue();
    this.quotes
      .submit({
        ...value,
        nationalId: value.nationalId.trim().toUpperCase(),
        vehiclePlate: value.vehiclePlate.trim().toUpperCase(),
        email: value.email.trim().toLowerCase(),
        phone: `+56${value.phone.replace(/\s/g, '')}`,
      })
      .pipe(
        take(1),
        finalize(() => {
          this.submitting.set(false);
          if (!this.submittedRequest()) {
            this.form.enable();
          }
        }),
      )
      .subscribe({
        next: (request) => this.submittedRequest.set(request),
        error: (error: unknown) => {
          this.errorKey.set(
            error instanceof QuoteRequestUnavailableError
              ? 'quoteRequest.errors.unavailable'
              : error instanceof InsuranceProductUnavailableError
                ? 'quoteRequest.errors.productUnavailable'
                : 'quoteRequest.errors.unexpected',
          );
        },
      });
  }

  showError(controlName: 'productId' | 'nationalId' | 'vehiclePlate' | 'email' | 'phone'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  clearMessages(): void {
    this.errorKey.set(null);
    this.attempted.set(false);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
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
import { profilingErrorKey } from '../../core/profiling/profiling.errors';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-quote-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProfilingPanelComponent,
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
  readonly sessionIdentity = environment.dataAccessMode === 'backend';
  readonly profilingReady = signal(false);
  private readonly profilingPanel = viewChild(ProfilingPanelComponent);
  readonly submitting = signal(false);
  readonly attempted = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly submittedRequest = signal<QuoteRequestRecord | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    productId: ['', Validators.required],
    customerType: ['natural' as const, Validators.required],
    nationalId: [
      '',
      this.sessionIdentity
        ? []
        : [Validators.required, Validators.pattern(/^[A-Za-z0-9.-]{6,20}$/)],
    ],
    vehiclePlate: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{5,8}$/)]],
    email: ['', this.sessionIdentity ? [] : [Validators.required, Validators.email]],
    phone: [
      '',
      this.sessionIdentity ? [] : [Validators.required, Validators.pattern(/^[0-9 ]{7,15}$/)],
    ],
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
    if (!this.profilingReady()) {
      this.errorKey.set('profiling.errors.consent');
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
            profilingErrorKey(error) ??
              (error instanceof QuoteRequestUnavailableError
                ? 'quoteRequest.errors.unavailable'
                : error instanceof InsuranceProductUnavailableError
                  ? 'quoteRequest.errors.productUnavailable'
                  : 'quoteRequest.errors.unexpected'),
          );
          if (profilingErrorKey(error)) {
            this.profilingPanel()?.reload();
          }
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

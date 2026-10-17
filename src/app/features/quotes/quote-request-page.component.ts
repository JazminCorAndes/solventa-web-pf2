import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { distinctUntilChanged, finalize, startWith, take } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  InsuranceProductUnavailableError,
  QuoteRequestUnavailableError,
} from '../../core/quotes/quote-request.errors';
import { QuoteRequestRecord, TravelDestination } from '../../core/quotes/quote-request.models';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { InputFilterDirective } from '../../shared/input-filter/input-filter.directive';

@Component({
  selector: 'app-quote-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    InputFilterDirective,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
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
  providers: [provideNativeDateAdapter()],
})
export class QuoteRequestPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly quotes = inject(QuoteRequestService);
  readonly user = inject(AuthService).user;
  readonly today = startOfToday();
  readonly submitting = signal(false);
  readonly attempted = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly submittedRequest = signal<QuoteRequestRecord | null>(null);
  readonly form = this.formBuilder.nonNullable.group(
    {
      productId: ['', Validators.required],
      vehiclePlate: [''],
      destination: this.formBuilder.control<TravelDestination | string>('', {
        nonNullable: true,
      }),
      departureDate: this.formBuilder.control<Date | null>(null),
      returnDate: this.formBuilder.control<Date | null>(null),
      birthDate: this.formBuilder.control<Date | null>(null),
      deviceType: [''],
      brandModel: [''],
      purchaseValue: [''],
      airline: [''],
      flightNumber: [''],
      flightDate: this.formBuilder.control<Date | null>(null),
      creditType: [''],
      monthlyPayment: [''],
      mortgageBalance: [''],
    },
    { validators: productDateRangeValidator },
  );
  private readonly productId = toSignal(this.form.controls.productId.valueChanges, {
    initialValue: this.form.controls.productId.value,
  });
  private readonly destinationValue = toSignal(this.form.controls.destination.valueChanges, {
    initialValue: this.form.controls.destination.value,
  });
  readonly selectedProduct = computed(
    () => this.quotes.products().find((product) => product.id === this.productId()) ?? null,
  );
  readonly documentTypeLabelKey = computed(
    () => `quoteRequest.documentTypes.${this.user()?.documentType ?? 'cc'}`,
  );
  readonly filteredTravelDestinations = computed(() => {
    const value = this.destinationValue();
    const query = normalizeSearch(typeof value === 'string' ? value : value.name);
    return this.quotes
      .travelDestinations()
      .filter((destination) => normalizeSearch(destination.name).includes(query));
  });
  readonly displayDestination = (destination: TravelDestination | string | null): string =>
    typeof destination === 'string' ? destination : (destination?.name ?? '');

  ngOnInit(): void {
    const requestedProduct = this.route.snapshot.queryParamMap.get('producto');
    if (requestedProduct) {
      this.form.controls.productId.setValue(requestedProduct);
    }
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
    this.form.controls.productId.valueChanges
      .pipe(
        startWith(this.form.controls.productId.value),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((productId) => this.configureProductFields(productId));
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
        productId: value.productId,
        productData: this.buildProductData(value.productId),
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
        next: (request) => {
          this.submittedRequest.set(request);
          void this.router.navigate(['/app/cotizaciones/ofertas']);
        },
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

  showError(controlName: FormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  showTravelDateError(): boolean {
    return (
      this.form.hasError('invalidTravelDates') &&
      (this.form.controls.returnDate.dirty || this.form.controls.returnDate.touched)
    );
  }

  clearMessages(): void {
    this.errorKey.set(null);
    this.attempted.set(false);
  }

  private configureProductFields(productId: string): void {
    for (const controlName of PRODUCT_CONTROL_NAMES) {
      this.form.controls[controlName].clearValidators();
    }

    const required = Validators.required;
    const positiveInteger = Validators.pattern(/^[1-9][0-9]*$/);
    switch (productId) {
      case 'automotive':
        this.form.controls.vehiclePlate.setValidators([
          required,
          Validators.pattern(/^[A-Za-z]{3}[0-9]{3}$/),
        ]);
        break;
      case 'travel':
        this.form.controls.destination.setValidators([required, destinationSelectionValidator]);
        this.form.controls.departureDate.setValidators(required);
        this.form.controls.returnDate.setValidators(required);
        break;
      case 'life':
        this.form.controls.birthDate.setValidators(required);
        break;
      case 'device-protection':
        this.form.controls.deviceType.setValidators([required, Validators.maxLength(40)]);
        this.form.controls.brandModel.setValidators([required, Validators.maxLength(80)]);
        this.form.controls.purchaseValue.setValidators([required, positiveInteger]);
        break;
      case 'parametric':
        this.form.controls.airline.setValidators([required, Validators.maxLength(80)]);
        this.form.controls.flightNumber.setValidators([
          required,
          Validators.pattern(/^[A-Za-z0-9]{2,10}$/),
        ]);
        this.form.controls.flightDate.setValidators(required);
        break;
      case 'payment-protection':
        this.form.controls.creditType.setValidators([required, Validators.maxLength(60)]);
        this.form.controls.monthlyPayment.setValidators([required, positiveInteger]);
        break;
      case 'mortgage-life':
        this.form.controls.birthDate.setValidators(required);
        this.form.controls.mortgageBalance.setValidators([required, positiveInteger]);
        break;
    }

    for (const controlName of PRODUCT_CONTROL_NAMES) {
      this.form.controls[controlName].updateValueAndValidity({ emitEvent: false });
    }
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private buildProductData(productId: string): Record<string, string> {
    const value = this.form.getRawValue();
    switch (productId) {
      case 'automotive':
        return { vehiclePlate: value.vehiclePlate.trim().toUpperCase() };
      case 'travel': {
        const destination = value.destination;
        return {
          destinationCountryCode: typeof destination === 'string' ? '' : destination.code,
          departureDate: toIsoDate(value.departureDate),
          returnDate: toIsoDate(value.returnDate),
        };
      }
      case 'life':
        return { birthDate: toIsoDate(value.birthDate) };
      case 'device-protection':
        return {
          deviceType: value.deviceType.trim(),
          brandModel: value.brandModel.trim(),
          purchaseValue: value.purchaseValue,
        };
      case 'parametric':
        return {
          airline: value.airline.trim(),
          flightNumber: value.flightNumber.trim().toUpperCase(),
          flightDate: toIsoDate(value.flightDate),
        };
      case 'payment-protection':
        return {
          creditType: value.creditType.trim(),
          monthlyPayment: value.monthlyPayment,
        };
      case 'mortgage-life':
        return {
          birthDate: toIsoDate(value.birthDate),
          mortgageBalance: value.mortgageBalance,
        };
      default:
        return {};
    }
  }
}

type FormControlName = keyof QuoteRequestPageComponent['form']['controls'];

const PRODUCT_CONTROL_NAMES = [
  'vehiclePlate',
  'destination',
  'departureDate',
  'returnDate',
  'birthDate',
  'deviceType',
  'brandModel',
  'purchaseValue',
  'airline',
  'flightNumber',
  'flightDate',
  'creditType',
  'monthlyPayment',
  'mortgageBalance',
] as const;

function productDateRangeValidator(control: AbstractControl): ValidationErrors | null {
  if (control.get('productId')?.value !== 'travel') {
    return null;
  }
  const departureDate = control.get('departureDate')?.value;
  const returnDate = control.get('returnDate')?.value;
  return departureDate instanceof Date &&
    returnDate instanceof Date &&
    returnDate.getTime() < departureDate.getTime()
    ? { invalidTravelDates: true }
    : null;
}

function startOfToday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function toIsoDate(value: Date | null): string {
  if (value === null) {
    return '';
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function destinationSelectionValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  return typeof value === 'object' && value !== null && 'code' in value
    ? null
    : { destinationSelection: true };
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
    .trim();
}

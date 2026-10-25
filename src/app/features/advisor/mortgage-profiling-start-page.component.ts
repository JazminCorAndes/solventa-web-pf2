import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, map, Subject, switchMap, take, takeUntil } from 'rxjs';
import { AdvisorProfilingService } from '../../core/advisor-profiling/advisor-profiling.service';
import {
  MortgageProfilingError,
  MortgageProfilingErrorCode,
  MortgageProfilingInput,
  MortgageProfilingRecord,
  MORTGAGE_UUID_PATTERN,
} from '../../core/advisor-profiling/advisor-profiling.models';
import { DocumentType, isPartnerIds } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';

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
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly selectedPartnerId = signal<string | null>(null);
  private readonly contextInvalidated = new Subject<void>();
  private requestGeneration = 0;
  private formOwnerId = this.auth.user()?.id ?? null;
  private formPartnerId: string | null = null;

  readonly processing = signal(false);
  readonly attempted = signal(false);
  readonly errorCode = signal<MortgageProfilingErrorCode | null>(null);
  private readonly resultState = signal<MortgageProfilingRecord | null>(null);
  private resultOwnerId: string | null = null;
  readonly result = computed(() => {
    const result = this.resultState();
    return result &&
      this.auth.user()?.id === this.resultOwnerId &&
      this.authorizedPartnerIds().includes(result.partnerId)
      ? result
      : null;
  });
  readonly pendingOperation = this.profiling.pendingOperation;
  readonly authorizedPartnerIds = computed(() => {
    const user = this.auth.user();
    return user?.role === 'advisor' && isPartnerIds(user.partnerIds) ? user.partnerIds : [];
  });
  readonly partnerId = computed(() => {
    const ids = this.authorizedPartnerIds();
    const selected = this.selectedPartnerId() ?? this.pendingOperation()?.partnerId;
    return ids.length === 1 ? ids[0] : selected && ids.includes(selected) ? selected : null;
  });
  readonly form = this.formBuilder.nonNullable.group({
    customerId: ['', [Validators.required, Validators.pattern(MORTGAGE_UUID_PATTERN)]],
    documentType: this.formBuilder.nonNullable.control<DocumentType>('cc', Validators.required),
    documentNumber: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
    birthDate: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}-\d{2}$/)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+57[0-9]{10}$/)]],
    creditReference: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{4,30}$/)]],
    creditAmount: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(1_000_000),
      Validators.pattern(/^\d+$/),
    ]),
    termMonths: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(12),
      Validators.max(360),
      Validators.pattern(/^\d+$/),
    ]),
    consentId: ['', [Validators.required, Validators.pattern(MORTGAGE_UUID_PATTERN)]],
    consentVersion: this.formBuilder.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.pattern(/^\d+$/),
    ]),
    consentVerified: [false, Validators.requiredTrue],
  });

  constructor() {
    this.synchronizeFormContext();
    effect(() => this.synchronizeFormContext());
  }

  submit(): void {
    this.synchronizeFormContext();
    const partnerId = this.partnerId();
    if (!partnerId) {
      this.errorCode.set('advisor_context_unavailable');
      return;
    }
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
    const input = this.buildInput(partnerId);
    const userId = this.auth.user()?.id;
    const generation = ++this.requestGeneration;
    const contextIsCurrent = () => {
      const user = this.auth.user();
      return (
        user?.id === userId &&
        user?.role === 'advisor' &&
        isPartnerIds(user.partnerIds) &&
        user.partnerIds.includes(partnerId)
      );
    };
    this.auth
      .getAccessToken()
      .pipe(
        switchMap((token) => {
          if (!token || !contextIsCurrent()) {
            throw new MortgageProfilingError('unauthorized_partner');
          }
          return this.profiling.start(input);
        }),
        map((result) => {
          if (!contextIsCurrent()) throw new MortgageProfilingError('unauthorized_partner');
          return result;
        }),
        take(1),
        takeUntil(this.contextInvalidated),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (generation !== this.requestGeneration) return;
          this.processing.set(false);
          if (!this.result()) {
            this.form.enable();
          }
        }),
      )
      .subscribe({
        next: (result) => {
          this.resultOwnerId = userId ?? null;
          this.resultState.set(result);
        },
        error: (error: unknown) => {
          console.error('Mortgage profiling could not be started.', error);
          this.errorCode.set(error instanceof MortgageProfilingError ? error.code : 'unexpected');
        },
      });
  }

  selectPartner(partnerId: string): void {
    if (
      !this.processing() &&
      !this.result() &&
      !this.pendingOperation() &&
      this.authorizedPartnerIds().includes(partnerId)
    ) {
      if (this.formPartnerId && this.formPartnerId !== partnerId) {
        this.resetFormState();
      }
      this.selectedPartnerId.set(partnerId);
      this.formPartnerId = partnerId;
      this.errorCode.set(null);
    }
  }

  startAnother(): void {
    if (this.processing()) return;
    this.resetFormState();
  }

  private resetFormState(): void {
    this.requestGeneration++;
    this.contextInvalidated.next();
    this.profiling.reset();
    this.selectedPartnerId.set(null);
    this.resultOwnerId = null;
    this.resultState.set(null);
    this.errorCode.set(null);
    this.attempted.set(false);
    this.processing.set(false);
    this.form.reset({
      customerId: '',
      documentType: 'cc',
      documentNumber: '',
      birthDate: '',
      phone: '',
      creditReference: '',
      creditAmount: null,
      termMonths: null,
      consentId: '',
      consentVersion: null,
      consentVerified: false,
    });
    this.form.enable();
  }

  private synchronizeFormContext(): void {
    const user = this.auth.user();
    const ownerId = user?.role === 'advisor' ? user.id : null;
    if (
      ownerId !== this.formOwnerId ||
      (this.formPartnerId && !this.authorizedPartnerIds().includes(this.formPartnerId))
    ) {
      this.resetFormState();
    }
    this.formOwnerId = ownerId;
    this.formPartnerId = this.partnerId();
    if (this.formPartnerId) this.selectedPartnerId.set(this.formPartnerId);
  }

  showError(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.touched || this.attempted());
  }

  private buildInput(partnerId: string): MortgageProfilingInput {
    const value = this.form.getRawValue();
    return {
      partnerId,
      customer: {
        id: value.customerId.trim().toLowerCase(),
        documentType: value.documentType,
        documentNumber: value.documentNumber.trim(),
        birthDate: value.birthDate,
        phone: value.phone.trim(),
      },
      credit: {
        reference: value.creditReference.trim(),
        amount: value.creditAmount ?? 0,
        termMonths: value.termMonths ?? 0,
      },
      consent: {
        id: value.consentId.trim().toLowerCase(),
        version: value.consentVersion ?? 0,
      },
    };
  }
}

import { DatePipe } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS, MAT_NATIVE_DATE_FORMATS } from '@angular/material/core';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
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
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import { InsuranceProduct } from '../../core/quotes/quote-request.models';
import { ClaimDateAdapter } from './claim-date-adapter';

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
  providers: [
    MatDatepickerIntl,
    { provide: DateAdapter, useClass: ClaimDateAdapter },
    {
      provide: MAT_DATE_FORMATS,
      useValue: {
        ...MAT_NATIVE_DATE_FORMATS,
        display: {
          ...MAT_NATIVE_DATE_FORMATS.display,
          dateInput: { year: 'numeric', month: '2-digit', day: '2-digit' },
        },
      },
    },
  ],
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTimepickerModule,
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
  private readonly adapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly calendarIntl = inject(MatDatepickerIntl);
  private readonly catalog = inject(QUOTE_REQUEST_GATEWAY);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly products = signal<InsuranceProduct[]>([]);
  readonly catalogStatus = signal<'loading' | 'ready' | 'error'>('loading');
  readonly submitted = signal(false);
  readonly touchUi = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 40rem)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  private readonly catalogRevision = signal(0);
  private restoredAttempt: string | null = null;
  readonly eventDay = new FormControl<Date | null>(null, Validators.required);
  readonly eventTime = new FormControl<Date | null>(null, Validators.required);
  readonly eventChoice = new FormControl('other', { nonNullable: true });
  readonly eventSuggestions = [
    { value: 'Choque', key: 'claims.events.collision' },
    { value: 'Hurto', key: 'claims.events.theft' },
    { value: 'Daños al vehículo', key: 'claims.events.damage' },
  ];
  private displayedOwner: string | null = null;
  readonly form = this.fb.group({
    polizaId: ['', Validators.required],
    fechaEvento: ['', Validators.required],
    tipoEvento: ['', [trimmedLength(1, 100)]],
    descripcion: ['', [trimmedLength(10, 5000)]],
    lugar: ['', [trimmedLength(1, 300)]],
  });

  constructor() {
    this.i18n.langChanges$.pipe(takeUntilDestroyed()).subscribe(() => this.updateDateLocale());
    this.updateDateLocale();
    this.eventDay.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncDate());
    this.eventTime.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncDate());
    this.form.addValidators(() => {
      const { polizaId, fechaEvento } = this.form.getRawValue();
      if (!polizaId || !fechaEvento) return null;
      if (!this.policyOptions.find((item) => item.id === polizaId)?.selectable)
        return { policyIdentity: true };
      const policy = this.claims.policies().find((item) => item.id === polizaId);
      return eventWithinPolicy(policy, new Date(fechaEvento)) ? null : { eventDate: true };
    });
    effect((onCleanup) => {
      const owner = this.auth.user();
      this.catalogRevision();
      this.products.set([]);
      this.catalogStatus.set('loading');
      if (!owner || owner.role !== 'client') {
        this.catalogStatus.set('error');
        return;
      }
      const subscription = this.catalog.loadProducts().subscribe({
        next: (products) => {
          this.products.set(products);
          this.catalogStatus.set('ready');
        },
        error: () => this.catalogStatus.set('error'),
      });
      onCleanup(() => subscription.unsubscribe());
    });
    effect(() => {
      const owner = this.auth.user()?.id ?? null;
      if (this.displayedOwner !== owner) {
        this.displayedOwner = owner;
        this.resetForm();
      }
      const attempt = this.claims.attempt();
      if (attempt && this.restoredAttempt !== attempt.key) {
        this.restoredAttempt = attempt.key;
        // A recovered operation restores its payload; an in-page submission keeps manual input.
        if (!this.form.controls.polizaId.value) {
          this.form.setValue(attempt.payload);
          this.restoreDate(attempt.payload.fechaEvento);
        }
      }
      if (!attempt) this.restoredAttempt = null;
      if (this.claims.locked() || this.claims.loading()) this.form.disable();
      else this.form.enable();
      for (const control of [this.eventDay, this.eventTime, this.eventChoice]) {
        if (this.form.disabled) control.disable({ emitEvent: false });
        else control.enable({ emitEvent: false });
      }
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
    effect(() => {
      this.products();
      this.catalogStatus();
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
    if (this.claims.locked() || this.claims.loading() || this.catalogStatus() !== 'ready') return;
    const value = this.form.getRawValue();
    const type =
      this.isAutomotive && this.eventChoice.value !== 'other'
        ? this.eventChoice.value
        : value.tipoEvento;
    // Suggested events are text, not a coverage or a backend enum.
    this.form.controls.tipoEvento.setValidators(
      this.isAutomotive && this.eventChoice.value !== 'other' ? [] : [trimmedLength(1, 100)],
    );
    this.form.controls.tipoEvento.updateValueAndValidity();
    this.form.updateValueAndValidity();
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.eventDay.markAsTouched();
    this.eventTime.markAsTouched();
    if (this.form.invalid || this.eventDay.invalid || this.eventTime.invalid) {
      const selector = (
        [
          [
            this.form.controls.polizaId.invalid || this.form.hasError('policyIdentity'),
            'mat-select[formcontrolname=polizaId]',
          ],
          [this.eventDay.invalid, '#claim-event-date'],
          [this.eventTime.invalid, '#claim-event-time'],
          [this.form.hasError('eventDate'), '#claim-event-time'],
          [this.form.controls.tipoEvento.invalid, 'input[formcontrolname=tipoEvento]'],
          [this.form.controls.lugar.invalid, 'input[formcontrolname=lugar]'],
          [this.form.controls.descripcion.invalid, 'textarea[formcontrolname=descripcion]'],
        ] as const
      ).find(([invalid]) => invalid)?.[1];
      if (selector) this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
      return;
    }
    this.claims.report({
      ...value,
      fechaEvento: new Date(value.fechaEvento).toISOString(),
      tipoEvento: type.trim(),
      descripcion: value.descripcion.trim(),
      lugar: value.lugar.trim(),
    });
  }

  newReport(): void {
    this.claims.newReport();
    if (!this.claims.record() && !this.claims.attempt()) this.resetForm();
  }

  get isAutomotive(): boolean {
    return (
      this.claims.policies().find((policy) => policy.id === this.form.controls.polizaId.value)
        ?.tipo === 'automotive'
    );
  }

  get policyOptions() {
    const policies = this.claims.policies();
    return policies.map((policy) => {
      const products = this.products().filter((product) => product.id === policy.tipo);
      const groupIds = policies
        .filter(
          (other) =>
            other.tipo === policy.tipo &&
            other.fechaInicio === policy.fechaInicio &&
            other.fechaFin === policy.fechaFin,
        )
        .map((other) => other.id)
        .sort();
      const selectable = products.length === 1 && this.catalogStatus() === 'ready';
      // Presentation ordinal only; sorting a separate ID array preserves the BFF list order.
      const option = selectable && groupIds.length > 1 ? groupIds.indexOf(policy.id) + 1 : null;
      const name =
        products.length === 1 ? products[0].name : this.i18n.translate('claims.unknownPolicy');
      const dates = new Intl.DateTimeFormat(this.dateLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
      });
      const period = `${dates.format(new Date(policy.fechaInicio))} – ${dates.format(new Date(policy.fechaFin))}`;
      return { id: policy.id, name, period, selectable, option };
    });
  }

  policyLabel(id: string): string {
    const policy = this.policyOptions.find((item) => item.id === id);
    if (!policy) return this.i18n.translate('claims.unavailablePolicy');
    const option = policy.option
      ? ` · ${this.i18n.translate('claims.presentationOption', { ordinal: policy.option })}`
      : '';
    return `${policy.name} · ${policy.period}${option}`;
  }

  get duplicatePolicies(): boolean {
    return this.policyOptions.some((policy) => policy.option !== null);
  }

  get ambiguousPolicies(): boolean {
    return (
      this.catalogStatus() === 'ready' && this.policyOptions.some((policy) => !policy.selectable)
    );
  }

  get periodStart(): Date | null {
    const policy = this.claims
      .policies()
      .find((item) => item.id === this.form.controls.polizaId.value);
    return policy ? new Date(`${policy.fechaInicio}T00:00:00Z`) : null;
  }

  get periodEnd(): Date {
    const policy = this.claims
      .policies()
      .find((item) => item.id === this.form.controls.polizaId.value);
    return new Date(
      Math.min(Date.now(), policy ? Date.parse(`${policy.fechaFin}T23:59:59.999Z`) : Date.now()),
    );
  }

  get minTime(): Date | null {
    return this.sameLocalDay(this.eventDay.value, this.periodStart) ? this.periodStart : null;
  }

  get maxTime(): Date | null {
    return this.sameLocalDay(this.eventDay.value, this.periodEnd) ? this.periodEnd : null;
  }

  get validPeriod(): { start: string; end: string } | null {
    const start = this.periodStart;
    return start
      ? { start: this.formatDate(start, true), end: this.formatDate(this.periodEnd, true) }
      : null;
  }

  retryCatalog(): void {
    this.catalogRevision.update((value) => value + 1);
  }

  private formatDate(date: Date, time = false): string {
    return new Intl.DateTimeFormat(this.dateLocale, {
      dateStyle: 'short',
      ...(time ? { timeStyle: 'short' } : {}),
    }).format(date);
  }

  private updateDateLocale(): void {
    this.adapter.setLocale(this.dateLocale);
    for (const key of [
      'calendarLabel',
      'openCalendarLabel',
      'closeCalendarLabel',
      'prevMonthLabel',
      'nextMonthLabel',
      'prevYearLabel',
      'nextYearLabel',
      'prevMultiYearLabel',
      'nextMultiYearLabel',
      'switchToMonthViewLabel',
      'switchToMultiYearViewLabel',
    ] as const) {
      this.calendarIntl[key] = this.i18n.translate(`claims.calendar.${key}`);
    }
    this.calendarIntl.formatYearRangeLabel = (start, end) =>
      this.i18n.translate('claims.calendar.yearRange', { start, end });
    this.calendarIntl.changes.next();
  }

  private sameLocalDay(a: Date | null, b: Date | null): boolean {
    return !!a && !!b && a.toDateString() === b.toDateString();
  }

  private restoreDate(timestamp: string): void {
    const date = new Date(timestamp);
    this.eventDay.setValue(date, { emitEvent: false });
    this.eventTime.setValue(date, { emitEvent: false });
  }

  private resetForm(): void {
    const now = new Date();
    this.form.reset({ fechaEvento: now.toISOString() });
    this.restoreDate(now.toISOString());
    this.eventChoice.reset('other', { emitEvent: false });
    this.submitted.set(false);
  }

  private syncDate(): void {
    const day = this.eventDay.value;
    const time = this.eventTime.value;
    if (!day || !time || !Number.isFinite(day.getTime()) || !Number.isFinite(time.getTime())) {
      this.form.controls.fechaEvento.setValue('');
      return;
    }
    const date = new Date(day);
    date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
    this.form.controls.fechaEvento.setValue(date.toISOString());
  }
}

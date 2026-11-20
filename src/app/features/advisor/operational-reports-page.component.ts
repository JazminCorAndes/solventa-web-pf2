import { CurrencyPipe, DatePipe, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { finalize, take } from 'rxjs';
import { OPERATIONAL_REPORT_GATEWAY } from '../../core/reports/operational-report.gateway';
import {
  OperationalReport,
  OperationalReportError,
  REPORT_POLICY_STATES,
  REPORT_PRODUCTS,
  ReportFilters,
  ReportOptions,
  ReportPolicyState,
  ReportProduct,
} from '../../core/reports/operational-report.models';

type ReportState =
  'idle' | 'loading' | 'ready' | 'forbidden' | 'invalid-filters' | 'incomplete' | 'error';
type DownloadState = 'idle' | 'downloading' | 'not-reproducible' | 'error';

const DAY = 86_400_000;

@Component({
  selector: 'app-operational-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    KeyValuePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './operational-reports-page.component.html',
  styleUrl: './operational-reports-page.component.scss',
})
export class OperationalReportsPageComponent implements OnInit {
  private readonly gateway = inject(OPERATIONAL_REPORT_GATEWAY);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);

  readonly options = signal<ReportOptions>({
    products: [...REPORT_PRODUCTS],
    statuses: [...REPORT_POLICY_STATES],
    maxPeriodDays: 366,
  });
  readonly state = signal<ReportState>('idle');
  readonly report = signal<OperationalReport | null>(null);
  readonly unavailableSource = signal<string | null>(null);
  readonly download = signal<DownloadState>('idle');
  readonly periodError = signal<'order' | 'length' | 'future' | 'cutoff' | null>(null);
  readonly empty = computed(() => {
    const report = this.report();
    return (
      report !== null &&
      report.policies.portfolio === 0 &&
      report.policies.issuedInPeriod === 0 &&
      report.premiums.confirmed === 0 &&
      report.claims.reported === 0 &&
      report.payments.registered === 0
    );
  });
  readonly hasInconsistencies = computed(() => {
    const report = this.report();
    return report !== null && Object.values(report.inconsistencies).some((value) => value > 0);
  });

  readonly form = new FormGroup({
    from: new FormControl(isoDay(Date.now() - 29 * DAY), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    to: new FormControl(isoDay(Date.now()), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    product: new FormControl<ReportProduct | null>(null),
    status: new FormControl<ReportPolicyState | null>(null),
    cutOff: new FormControl('', { nonNullable: true }),
  });

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  ngOnInit(): void {
    // Un cambio en los filtros invalida el reporte mostrado: nunca se descarga otro distinto.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.state() === 'ready' || this.state() === 'invalid-filters') {
        this.state.set('idle');
        this.report.set(null);
        this.download.set('idle');
      }
    });
    this.gateway
      .options()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => this.options.set(options),
        error: (error: unknown) => {
          if (error instanceof OperationalReportError && error.kind === 'forbidden') {
            this.state.set('forbidden');
          }
        },
      });
  }

  query(): void {
    if (this.state() === 'loading' || this.state() === 'forbidden') {
      return;
    }
    const filters = this.filters();
    if (!filters) {
      return;
    }
    const cutOff = this.cutOff();
    this.state.set('loading');
    this.report.set(null);
    this.download.set('idle');
    this.unavailableSource.set(null);
    this.gateway
      .report(filters, cutOff)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.state.set('ready');
        },
        error: (error: unknown) => {
          if (error instanceof OperationalReportError) {
            if (error.kind === 'incomplete') {
              this.unavailableSource.set(error.source);
            }
            this.state.set(error.kind === 'not-reproducible' ? 'error' : error.kind);
            return;
          }
          console.error('The operational report could not be loaded.', error);
          this.state.set('error');
        },
      });
  }

  /** Descarga exactamente el reporte confirmado en pantalla: mismo corte, filtros y huella. */
  downloadReport(): void {
    const report = this.report();
    if (!report || this.download() === 'downloading') {
      return;
    }
    this.download.set('downloading');
    this.gateway
      .download(report.filters, report.cutOff, report.fingerprint)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.download() === 'downloading') {
            this.download.set('idle');
          }
        }),
      )
      .subscribe({
        next: ({ file, fileName }) => save(file, fileName),
        error: (error: unknown) => {
          if (error instanceof OperationalReportError && error.kind === 'not-reproducible') {
            this.download.set('not-reproducible');
            return;
          }
          console.error('The operational report could not be downloaded.', error);
          this.download.set('error');
        },
      });
  }

  productLabel(product: string): string {
    return this.label(`operationalReports.products.${product}`, product);
  }

  label(key: string, fallback: string): string {
    const value = this.i18n.translate(key);
    return value === key ? fallback : value;
  }

  amount(value: string): number {
    return Number(value);
  }

  private filters(): ReportFilters | null {
    this.form.markAllAsTouched();
    const { from, to, product, status } = this.form.getRawValue();
    if (this.form.invalid || !from || !to) {
      return null;
    }
    const start = Date.parse(from);
    const end = Date.parse(to);
    const cutOff = this.cutOff();
    const limit = cutOff ? Date.parse(cutOff) : Date.now();
    if (cutOff && limit > Date.now()) {
      this.periodError.set('cutoff');
      return null;
    }
    if (end < start) {
      this.periodError.set('order');
      return null;
    }
    if ((end - start) / DAY + 1 > this.options().maxPeriodDays) {
      this.periodError.set('length');
      return null;
    }
    if (end > Date.parse(isoDay(limit))) {
      this.periodError.set('future');
      return null;
    }
    this.periodError.set(null);
    return { from, to, product: product ?? null, status: status ?? null };
  }

  private cutOff(): string | null {
    const value = this.form.controls.cutOff.value;
    if (!value) {
      return null;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
      : null;
  }
}

function isoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function save(file: Blob, fileName: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

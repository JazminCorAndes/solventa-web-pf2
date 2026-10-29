import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  EventEmitter,
  inject,
  OnInit,
  Output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize, Observable, take } from 'rxjs';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { DocumentType, QuoteRequestDraft } from '../../core/quotes/quote-request.models';
import {
  HttpPartnerQuoteGateway,
  PartnerClientLookup,
  PartnerQuoteRequest,
  PartnerQuoteResult,
  partnerQuoteErrorCode,
  partnerQuoteErrorKey,
  partnerRetryDelay,
  UUID_PATTERN,
} from '../../data-access/quotes/http-partner-quote.gateway';

@Component({
  selector: 'app-partner-quote-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  templateUrl: './partner-quote-panel.component.html',
  styles: `
    :host {
      display: block;
      margin-bottom: var(--solventa-space-4);
    }
    .fields {
      display: grid;
      gap: var(--solventa-space-3);
    }
    dl {
      overflow-wrap: anywhere;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0 0 var(--solventa-space-2);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .client-summary {
      display: grid;
      gap: var(--solventa-space-1);
      padding: var(--solventa-space-3);
      border: 1px solid var(--solventa-color-border);
      border-radius: var(--solventa-radius-sm);
      background: var(--solventa-color-background);
    }
    .client-summary span {
      color: var(--solventa-color-text-secondary);
    }
  `,
})
export class PartnerQuotePanelComponent implements OnInit {
  private readonly partners = inject(PartnerContextService);
  private readonly gateway = inject(HttpPartnerQuoteGateway);
  private readonly builder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private pendingRequest: PartnerQuoteRequest | null = null;
  private retryTimer?: ReturnType<typeof setTimeout>;
  @Output() readonly lockedChange = new EventEmitter<boolean>();
  @Output() readonly loadingChange = new EventEmitter<boolean>();
  readonly context = this.partners.context;
  readonly operationId = signal<string | null>(null);
  readonly result = signal<PartnerQuoteResult | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly loading = signal(false);
  readonly retrySeconds = signal(0);
  readonly locked = signal(false);
  readonly clientLookup = signal<PartnerClientLookup | null>(null);
  readonly lookupLoading = signal(false);
  readonly form = this.builder.nonNullable.group({
    socioId: ['', Validators.required],
    tipoDocumento: this.builder.nonNullable.control<DocumentType>('cc'),
    numeroDocumento: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,15}$/)]],
  });
  private readonly selectedPartner = toSignal(this.form.controls.socioId.valueChanges, {
    initialValue: '',
  });
  readonly allowedProductIds = computed(
    () =>
      this.context()?.socios.find((partner) => partner.socioId === this.selectedPartner())
        ?.productos ?? [],
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.retryTimer));
    this.form.controls.socioId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearClientLookup());
    this.form.controls.tipoDocumento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearClientLookup());
    this.form.controls.numeroDocumento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearClientLookup());
  }

  ngOnInit(): void {
    const socioId = this.route.snapshot.queryParamMap.get('socio');
    const partners = this.context()?.socios ?? [];
    if (partners.some((partner) => partner.socioId === socioId)) {
      this.form.controls.socioId.setValue(socioId!);
    } else if (partners.length === 1) {
      this.form.controls.socioId.setValue(partners[0].socioId);
    }
    const operationId = this.route.snapshot.queryParamMap.get('operacion');
    if (operationId) {
      if (
        !UUID_PATTERN.test(operationId) ||
        !socioId ||
        this.form.controls.socioId.value !== socioId
      ) {
        this.errorKey.set('partnerQuote.errors.invalid');
        return;
      }
      this.operationId.set(operationId);
      this.setLocked(true);
      this.recover();
    }
  }

  submit(draft: QuoteRequestDraft): void {
    if (this.loading() || this.result() || this.retrySeconds() || this.locked()) return;
    this.errorKey.set(null);
    if (
      this.form.invalid ||
      this.clientLookup()?.consentimientoEstado !== 'vigente' ||
      !this.context()?.alcances.includes('perfilamientos:crear') ||
      !this.allowedProductIds().includes(draft.productId)
    ) {
      this.form.markAllAsTouched();
      this.errorKey.set('partnerQuote.errors.invalid');
      return;
    }
    const values = this.form.getRawValue();
    const operationId = this.operationId() ?? crypto.randomUUID();
    const request: PartnerQuoteRequest = {
      operationId,
      socioId: values.socioId,
      productoId: draft.productId,
      datosProducto: { ...draft.productData },
      cliente: {
        tipoCliente: 'persona_natural',
        tipoDocumento: values.tipoDocumento,
        numeroDocumento: values.numeroDocumento,
      },
    };
    this.pendingRequest = request;
    this.operationId.set(operationId);
    this.setLocked(true);
    this.setLoading(true);
    void this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: { operacion: operationId, socio: values.socioId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then((navigated) => {
        if (this.destroyRef.destroyed) return;
        if (!navigated) {
          this.setLoading(false);
          this.errorKey.set('partnerQuote.errors.unavailable');
          return;
        }
        this.run(this.gateway.submit(request));
      })
      .catch(() => {
        if (!this.destroyRef.destroyed) {
          this.setLoading(false);
          this.errorKey.set('partnerQuote.errors.unavailable');
        }
      });
  }

  lookupClient(): void {
    if (
      this.lookupLoading() ||
      this.locked() ||
      this.form.controls.socioId.invalid ||
      this.form.controls.tipoDocumento.invalid ||
      this.form.controls.numeroDocumento.invalid
    ) {
      this.form.controls.numeroDocumento.markAsTouched();
      return;
    }
    this.errorKey.set(null);
    this.lookupLoading.set(true);
    const { socioId, tipoDocumento, numeroDocumento } = this.form.getRawValue();
    this.gateway
      .lookupClient(socioId, tipoDocumento, numeroDocumento.trim().toUpperCase())
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.lookupLoading.set(false)),
      )
      .subscribe({
        next: (client) => {
          this.clientLookup.set(client);
          if (client.consentimientoEstado !== 'vigente') {
            this.errorKey.set('partnerQuote.errors.consent');
          }
        },
        error: (error: unknown) => this.errorKey.set(partnerQuoteErrorKey(error)),
      });
  }

  retry(): void {
    if (this.loading() || this.retrySeconds() || this.result()) return;
    if (this.pendingRequest) {
      if (!this.allowedProductIds().includes(this.pendingRequest.productoId)) {
        this.errorKey.set('partnerQuote.errors.forbidden');
        return;
      }
      this.run(this.gateway.submit(this.pendingRequest));
    } else {
      this.recover();
    }
  }

  recover(): void {
    const operationId = this.operationId();
    if (!operationId || this.loading() || this.retrySeconds()) return;
    this.run(this.gateway.load(operationId, this.form.controls.socioId.value), true);
  }

  newOperation(): void {
    if (this.loading() || this.retrySeconds()) return;
    void this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: { operacion: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .then((navigated) => {
        if (!navigated || this.destroyRef.destroyed) return;
        clearTimeout(this.retryTimer);
        this.retrySeconds.set(0);
        this.pendingRequest = null;
        this.operationId.set(null);
        this.result.set(null);
        this.clientLookup.set(null);
        this.errorKey.set(null);
        this.setLocked(false);
      })
      .catch(() => this.errorKey.set('partnerQuote.errors.unavailable'));
  }

  private run(operation: Observable<PartnerQuoteResult>, recovery = false): void {
    this.setLoading(true);
    this.errorKey.set(null);
    operation
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setLoading(false)),
      )
      .subscribe({
        next: (result) => {
          if (
            !this.context()?.socios.some(
              (partner) =>
                partner.socioId === result.socioId && partner.productos.includes(result.productoId),
            )
          ) {
            this.errorKey.set('partnerQuote.errors.forbidden');
            return;
          }
          this.result.set(result);
          this.pendingRequest = null;
          this.setLocked(true);
        },
        error: (error: unknown) => {
          this.errorKey.set(partnerQuoteErrorKey(error));
          this.waitForRetry(partnerRetryDelay(error));
          if (
            recovery &&
            !this.pendingRequest &&
            ['operacion_no_encontrada', 'operacion_reintentable'].includes(
              partnerQuoteErrorCode(error) ?? '',
            )
          ) {
            this.setLocked(false);
          }
        },
      });
  }

  private waitForRetry(seconds: number): void {
    clearTimeout(this.retryTimer);
    this.retrySeconds.set(seconds);
    if (seconds > 0) {
      this.retryTimer = setTimeout(() => this.waitForRetry(seconds - 1), 1000);
    }
  }

  private setLocked(locked: boolean): void {
    this.locked.set(locked);
    if (locked) this.form.disable();
    else {
      this.form.enable();
      if (this.operationId()) this.form.controls.socioId.disable();
    }
    this.lockedChange.emit(locked);
  }

  private setLoading(loading: boolean): void {
    this.loading.set(loading);
    this.loadingChange.emit(loading);
  }

  private clearClientLookup(): void {
    this.clientLookup.set(null);
    if (!this.operationId()) this.errorKey.set(null);
  }
}

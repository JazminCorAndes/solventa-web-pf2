import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  EventEmitter,
  inject,
  OnInit,
  Output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  catchError,
  EMPTY,
  finalize,
  map,
  Observable,
  Subject,
  switchMap,
  take,
  takeUntil,
  throwError,
} from 'rxjs';
import { documentNumberFilter, documentNumberValidator } from '../../core/market/document-number';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { OfferSelectionState, ProvisionalSelectionRequest } from '../../core/offers/offer.models';
import { DocumentType, QuoteRequestDraft } from '../../core/quotes/quote-request.models';
import {
  HttpPartnerQuoteGateway,
  PartnerClientLookup,
  PartnerQuoteRequest,
  PartnerQuoteResult,
  PartnerOfferOption,
  PartnerOfferSnapshot,
  partnerQuoteErrorCode,
  partnerQuoteErrorKey,
  partnerRetryDelay,
  UUID_PATTERN,
} from '../../data-access/quotes/http-partner-quote.gateway';
import { InputFilterDirective } from '../../shared/input-filter/input-filter.directive';

@Component({
  selector: 'app-partner-quote-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CurrencyPipe,
    InputFilterDirective,
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
    .client-summary h4 {
      margin: var(--solventa-space-2) 0 0;
    }
    .offer-explanation {
      display: grid;
      gap: var(--solventa-space-2);
    }
    .offer-explanation p {
      margin: 0;
    }
    .factor-list {
      display: grid;
      gap: var(--solventa-space-2);
      margin: 0;
    }
    .factor-list div,
    .factor-list dd {
      display: grid;
      gap: var(--solventa-space-1);
    }
    .offers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
      gap: var(--solventa-space-4);
      margin: var(--solventa-space-4) 0;
    }
    .plan-card {
      display: flex;
      flex-direction: column;
      gap: var(--solventa-space-3);
      border: 1px solid var(--solventa-color-border);
      border-radius: var(--solventa-radius-sm);
      padding: var(--solventa-space-4);
      overflow-wrap: anywhere;
    }
    .plan-card.selected {
      outline: 2px solid var(--mat-sys-primary);
    }
    .plan-card h4,
    .plan-card p {
      margin: 0;
    }
    .plan-actions {
      margin-top: auto;
    }
    .selection-summary {
      padding: var(--solventa-space-3);
      border: 1px solid var(--solventa-color-border);
      border-radius: var(--solventa-radius-sm);
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
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private choicesExpiryTimer?: ReturnType<typeof setTimeout>;
  private operationOwnerId?: string;
  private readonly offerCancelled = new Subject<void>();
  @Output() readonly lockedChange = new EventEmitter<boolean>();
  @Output() readonly loadingChange = new EventEmitter<boolean>();
  readonly context = this.partners.context;
  readonly operationId = signal<string | null>(null);
  readonly result = signal<PartnerQuoteResult | null>(null);
  readonly offerExpired = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly loading = signal(false);
  readonly retrySeconds = signal(0);
  readonly locked = signal(false);
  readonly clientLookup = signal<PartnerClientLookup | null>(null);
  readonly lookupLoading = signal(false);
  readonly offerSnapshot = signal<PartnerOfferSnapshot | null>(null);
  readonly offerSelection = signal<OfferSelectionState | null>(null);
  readonly offersLoading = signal(false);
  readonly savingSelection = signal(false);
  readonly offersMissing = signal(false);
  readonly choicesExpired = signal(false);
  readonly offerErrorKey = signal<string | null>(null);
  readonly pendingOfferSelection = signal<ProvisionalSelectionRequest | null>(null);
  readonly offersBusy = computed(() => this.offersLoading() || this.savingSelection());
  readonly quoteReadOnly = computed(() => {
    const status = this.result()?.estadoSolicitud;
    return status !== undefined && status !== 'pendiente';
  });
  readonly quoteExpired = computed(() => this.result()?.estadoSolicitud === 'vencida');
  readonly form = this.builder.nonNullable.group({
    socioId: ['', Validators.required],
    tipoDocumento: this.builder.nonNullable.control<DocumentType>('cc'),
    numeroDocumento: ['', [Validators.required, documentNumberValidator('tipoDocumento')]],
  });
  readonly documentNumberFilter = documentNumberFilter;
  private readonly selectedPartner = toSignal(this.form.controls.socioId.valueChanges, {
    initialValue: '',
  });
  readonly allowedProductIds = computed(
    () =>
      this.context()?.socios.find((partner) => partner.socioId === this.selectedPartner())
        ?.productos ?? [],
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.retryTimer);
      clearTimeout(this.expiryTimer);
      clearTimeout(this.choicesExpiryTimer);
      this.offerCancelled.next();
      this.offerCancelled.complete();
    });
    effect(() => {
      const context = this.context();
      const result = this.result();
      if (
        this.operationOwnerId &&
        (context?.usuario.id !== this.operationOwnerId ||
          (result && !this.ownsOfferContext(result)))
      ) {
        untracked(() => {
          this.resetOffers();
          this.result.set(null);
          this.updateOfferExpiry();
          this.errorKey.set('partnerQuote.errors.forbidden');
        });
      }
    });
    this.form.controls.socioId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearClientLookup());
    this.form.controls.tipoDocumento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.form.enabled) this.form.controls.numeroDocumento.updateValueAndValidity();
        this.clearClientLookup();
      });
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
    if (
      !operationId ||
      this.loading() ||
      this.offersBusy() ||
      this.pendingOfferSelection() ||
      this.retrySeconds()
    )
      return;
    this.run(this.gateway.load(operationId, this.form.controls.socioId.value), true);
  }

  newOperation(): void {
    if (this.quoteReadOnly()) return;
    if (this.loading() || this.offersBusy() || this.pendingOfferSelection() || this.retrySeconds())
      return;
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
        this.resetOffers();
        this.updateOfferExpiry();
        this.clientLookup.set(null);
        this.errorKey.set(null);
        this.setLocked(false);
      })
      .catch(() => this.errorKey.set('partnerQuote.errors.unavailable'));
  }

  private run(operation: Observable<PartnerQuoteResult>, recovery = false): void {
    this.operationOwnerId = this.context()?.usuario.id;
    this.resetOffers();
    this.setLoading(true);
    this.errorKey.set(null);
    this.result.set(null);
    this.updateOfferExpiry();
    operation
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setLoading(false)),
      )
      .subscribe({
        next: (result) => {
          if (!this.ownsOfferContext(result)) {
            this.errorKey.set('partnerQuote.errors.forbidden');
            return;
          }
          this.result.set(result);
          this.updateOfferExpiry();
          this.pendingRequest = null;
          this.setLocked(true);
          this.loadOffers();
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

  loadOffers(create = false): void {
    const operation = this.result();
    if (
      !operation ||
      this.quoteExpired() ||
      (create && this.quoteReadOnly()) ||
      !this.ownsOfferContext(operation) ||
      this.offersBusy() ||
      this.pendingOfferSelection() ||
      this.retrySeconds()
    )
      return;
    this.offersLoading.set(true);
    this.offerErrorKey.set(null);
    this.offersMissing.set(false);
    this.offerSnapshot.set(null);
    this.offerSelection.set(null);
    this.updateChoicesExpiry();
    const request = create
      ? this.gateway.createOfferSnapshot(operation)
      : this.gateway.loadOfferSnapshot(operation);
    request
      .pipe(
        catchError((error: unknown) => {
          if (
            !create &&
            error instanceof HttpErrorResponse &&
            error.status === 404 &&
            partnerQuoteErrorCode(error) === 'oferta_no_encontrada'
          ) {
            this.offersMissing.set(true);
            return EMPTY;
          }
          return throwError(() => error);
        }),
        switchMap((snapshot) =>
          this.gateway
            .loadOfferSelection(operation)
            .pipe(map((selection) => ({ snapshot, selection }))),
        ),
        take(1),
        takeUntil(this.offerCancelled),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.offersLoading.set(false)),
      )
      .subscribe({
        next: ({ snapshot, selection }) => {
          if (!this.ownsOfferContext(operation)) {
            this.denyOfferAccess();
            return;
          }
          this.offerSnapshot.set(snapshot);
          this.offerSelection.set(selection);
          this.updateChoicesExpiry();
        },
        error: (error: unknown) => this.failOffer(error),
      });
  }

  isOfferSelected(offer: PartnerOfferOption): boolean {
    const state = this.offerSelection();
    const selection = state?.acceptance ?? state?.selection;
    return selection?.offerId === offer.ofertaId && selection.offerVersion === offer.version;
  }

  isOfferSelectable(offer: PartnerOfferOption): boolean {
    const snapshot = this.offerSnapshot();
    const state = this.offerSelection();
    return (
      !!snapshot &&
      !this.quoteReadOnly() &&
      !!state &&
      this.ownsOfferContext() &&
      snapshot.estado === 'vigente' &&
      !this.choicesExpired() &&
      !this.offersBusy() &&
      !this.pendingOfferSelection() &&
      !state.acceptance &&
      !this.retrySeconds() &&
      !this.isOfferSelected(offer) &&
      snapshot.ofertas.some(
        (candidate) => candidate.ofertaId === offer.ofertaId && candidate.version === offer.version,
      )
    );
  }

  selectOffer(offer: PartnerOfferOption): void {
    const operation = this.result();
    const state = this.offerSelection();
    if (!operation || !state || !this.isOfferSelectable(offer)) return;
    const request: ProvisionalSelectionRequest = {
      quoteId: operation.solicitudId,
      offerId: offer.ofertaId,
      offerVersion: offer.version,
      expectedRevision: state.selection?.revision ?? 0,
      idempotencyKey: crypto.randomUUID(),
    };
    this.pendingOfferSelection.set(request);
    this.saveOfferSelection(operation, request);
  }

  retryOfferSelection(): void {
    const operation = this.result();
    const request = this.pendingOfferSelection();
    if (
      !operation ||
      this.quoteReadOnly() ||
      !request ||
      this.offersBusy() ||
      this.retrySeconds() ||
      !this.ownsOfferContext(operation)
    )
      return;
    this.saveOfferSelection(operation, request);
  }

  recoverOfferSelection(): void {
    const operation = this.result();
    if (!operation || this.offersBusy() || this.retrySeconds() || !this.ownsOfferContext(operation))
      return;
    this.offersLoading.set(true);
    this.offerErrorKey.set(null);
    this.gateway
      .loadOfferSelection(operation)
      .pipe(
        take(1),
        takeUntil(this.offerCancelled),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.offersLoading.set(false)),
      )
      .subscribe({
        next: (state) => this.applyOfferSelection(state),
        error: (error: unknown) => this.failOffer(error),
      });
  }

  private saveOfferSelection(
    operation: PartnerQuoteResult,
    request: ProvisionalSelectionRequest,
  ): void {
    this.savingSelection.set(true);
    this.offerErrorKey.set(null);
    this.gateway
      .saveOfferSelection(operation, request)
      .pipe(
        switchMap(() => this.gateway.loadOfferSelection(operation)),
        take(1),
        takeUntil(this.offerCancelled),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.savingSelection.set(false)),
      )
      .subscribe({
        next: (state) => this.applyOfferSelection(state),
        error: (error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            ([400, 401, 403, 404, 422].includes(error.status) ||
              [
                'seleccion_desactualizada',
                'seleccion_no_modificable',
                'idempotencia_conflicto',
              ].includes(partnerQuoteErrorCode(error) ?? ''))
          ) {
            this.pendingOfferSelection.set(null);
            this.offerSelection.set(null);
            this.failOffer(error);
          } else {
            this.waitForRetry(partnerRetryDelay(error));
            this.offerErrorKey.set('partnerQuote.offerErrors.uncertain');
          }
        },
      });
  }

  private applyOfferSelection(state: OfferSelectionState): void {
    if (!this.ownsOfferContext()) {
      this.denyOfferAccess();
      return;
    }
    this.offerSelection.set(state);
    const pending = this.pendingOfferSelection();
    if (!pending) return;
    if (state.acceptance) {
      this.pendingOfferSelection.set(null);
    } else if (state.selection && state.selection.revision > pending.expectedRevision) {
      this.pendingOfferSelection.set(null);
      if (
        state.selection.offerId !== pending.offerId ||
        state.selection.offerVersion !== pending.offerVersion
      ) {
        this.offerErrorKey.set('partnerQuote.offerErrors.changed');
      }
    } else {
      this.offerErrorKey.set('partnerQuote.offerErrors.uncertain');
    }
  }

  private failOffer(error: unknown): void {
    this.waitForRetry(partnerRetryDelay(error));
    if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
      this.denyOfferAccess(partnerQuoteErrorKey(error));
      return;
    }
    this.offerErrorKey.set(
      error instanceof HttpErrorResponse
        ? error.status === 409
          ? 'partnerQuote.offerErrors.changed'
          : error.status === 422
            ? 'partnerQuote.offerErrors.unavailable'
            : error.status === 429
              ? 'partnerQuote.errors.quota'
              : 'partnerQuote.offerErrors.load'
        : 'partnerQuote.offerErrors.response',
    );
  }

  private denyOfferAccess(key = 'partnerQuote.errors.forbidden'): void {
    this.resetOffers();
    this.result.set(null);
    this.updateOfferExpiry();
    this.errorKey.set(key);
  }

  private ownsOfferContext(operation = this.result()): boolean {
    const context = this.context();
    return (
      !!operation &&
      !!context &&
      context.usuario.id === this.operationOwnerId &&
      context.alcances.includes('perfilamientos:crear') &&
      context.socios.some(
        (partner) =>
          partner.socioId === operation.socioId && partner.productos.includes(operation.productoId),
      )
    );
  }

  private resetOffers(): void {
    this.offerCancelled.next();
    this.offerSnapshot.set(null);
    this.offerSelection.set(null);
    this.pendingOfferSelection.set(null);
    this.offersLoading.set(false);
    this.savingSelection.set(false);
    this.offersMissing.set(false);
    this.offerErrorKey.set(null);
    this.updateChoicesExpiry();
  }

  private updateChoicesExpiry(): void {
    clearTimeout(this.choicesExpiryTimer);
    const snapshot = this.offerSnapshot();
    const remaining = snapshot ? Date.parse(snapshot.vigenteHasta) - Date.now() : 0;
    this.choicesExpired.set(!!snapshot && (snapshot.estado === 'vencida' || remaining <= 0));
    if (snapshot && snapshot.estado === 'vigente' && remaining > 0) {
      this.choicesExpiryTimer = setTimeout(
        () => this.updateChoicesExpiry(),
        Math.min(remaining, 2_147_483_647),
      );
    }
  }

  private updateOfferExpiry(): void {
    clearTimeout(this.expiryTimer);
    const offer = this.result()?.oferta;
    const remaining = offer ? Date.parse(offer.vigenteHasta) - Date.now() : 0;
    this.offerExpired.set(!!offer && remaining <= 0);
    if (offer && remaining > 0) {
      // setTimeout uses a signed 32-bit delay; recheck long-lived offers without overflow.
      this.expiryTimer = setTimeout(
        () => this.updateOfferExpiry(),
        Math.min(remaining, 2_147_483_647),
      );
    }
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

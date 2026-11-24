import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  effect,
  computed,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { QuoteRequestService } from '../../core/quotes/quote-request.service';
import { forkJoin, map, of, switchMap, Subscription, take, finalize } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import {
  HttpQuoteHistoryGateway,
  QuoteHistoryEntry,
} from '../../data-access/quotes/http-quote-history.gateway';
import { ProfilingPanelComponent } from '../../shared/profiling/profiling-panel.component';

@Component({
  selector: 'app-quote-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    TranslocoPipe,
    ProfilingPanelComponent,
  ],
  templateUrl: './quote-summary-page.component.html',
  styleUrl: './quote-summary-page.component.scss',
})
export class QuoteSummaryPageComponent implements OnInit {
  readonly quotes = inject(QuoteRequestService);
  private readonly gateway = inject(QUOTE_REQUEST_GATEWAY);
  private readonly history = inject(HttpQuoteHistoryGateway);
  private readonly user = inject(AuthService).user;
  private readonly translations = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private rejectionRequest?: Subscription;
  private stateRequests = new Subscription();
  private readonly ownerId = signal<string | null>(null);
  private readonly resumeError = inject(ActivatedRoute).snapshot.queryParamMap.get('error');
  readonly resumeErrorKey =
    this.resumeError === 'expired'
      ? 'profiling.errors.expired'
      : this.resumeError === 'consent'
        ? 'profiling.errors.consent'
        : this.resumeError === 'resume'
          ? 'quoteSummary.resumeError'
          : null;
  readonly profileAvailability = signal<Record<string, boolean>>({});
  readonly loading = signal(true);
  readonly error = signal(false);
  private readonly cardsState = signal<QuoteCard[]>([]);
  readonly cards = computed(() =>
    this.ownerId() === this.user()?.id
      ? this.cardsState().filter((card) => !['completada', 'vencida'].includes(card.state.status))
      : [],
  );
  readonly rejectionBusy = signal(false);
  readonly rejectionError = signal<string | null>(null);
  readonly pendingRejection = signal<RejectionAttempt | null>(null);

  constructor() {
    effect(() => {
      const owner = this.user()?.id ?? null;
      if (owner !== this.ownerId()) untracked(() => this.load());
    });
  }

  productName(request: QuoteRequestRecord): string {
    return (
      this.quotes.products().find((product) => product.id === request.productId)?.name ??
      request.productId
    );
  }

  productDetails(request: QuoteRequestRecord) {
    return Object.entries(request.productData).map(([key, value]) => ({
      labelKey: `quoteRequest.fields.${key === 'referenciaCredito' ? 'creditReference' : key}`,
      valueKey:
        key === 'coverageType'
          ? `quoteRequest.flightCoverages.${value}`
          : key === 'weatherEvent'
            ? `quoteRequest.weatherEvents.${value}`
            : null,
      value:
        key === 'destinationCountryCode'
          ? (this.quotes.travelDestinations().find((destination) => destination.code === value)
              ?.name ?? value)
          : value,
    }));
  }

  ngOnInit(): void {
    this.quotes.loadProducts();
    this.quotes.loadTravelDestinations();
    this.load();
  }

  load(): void {
    this.loadRequest?.unsubscribe();
    const owner = this.user()?.id ?? null;
    if (this.ownerId() !== owner) {
      this.rejectionRequest?.unsubscribe();
      this.stateRequests.unsubscribe();
      this.stateRequests = new Subscription();
      this.rejectionBusy.set(false);
      this.pendingRejection.set(null);
      this.rejectionError.set(null);
    }
    this.ownerId.set(owner);
    this.loading.set(true);
    this.error.set(false);
    this.cardsState.set([]);
    this.profileAvailability.set({});
    if (!owner) {
      this.error.set(true);
      this.loading.set(false);
      return;
    }
    this.loadRequest = this.history
      .loadClientHistory(owner)
      .pipe(
        switchMap((history) => {
          const entries = history.filter(
            (entry) => !['completada', 'vencida'].includes(entry.status),
          );
          return (
            entries.length
              ? forkJoin(entries.map((entry) => this.gateway.loadRequest(entry.requestId)))
              : of([] as QuoteRequestRecord[])
          ).pipe(
            map((requests) =>
              entries.map((state, index): QuoteCard => {
                const request = requests[index];
                if (request.id !== state.requestId || request.productId !== state.productId) {
                  throw new Error('Quote details do not match the authenticated history.');
                }
                return { request, state, progress: continuation(state) };
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (cards) => {
          if (this.user()?.id !== owner) return;
          this.cardsState.set(cards);
          const pending = this.pendingRejection();
          if (
            pending &&
            cards.some(
              (card) =>
                card.state.requestId === pending.requestId && card.state.status !== 'pendiente',
            )
          ) {
            this.pendingRejection.set(null);
          }
          this.loading.set(false);
        },
        error: (error: unknown) => {
          if (this.user()?.id !== owner) return;
          console.error('Quote history could not be loaded.', error);
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  setProfileAvailability(id: string, available: boolean): void {
    const previous = this.profileAvailability()[id];
    this.profileAvailability.update((current) => ({ ...current, [id]: available }));
    if (previous && !available) this.refreshState(id);
  }

  refreshState(id: string): void {
    const owner = this.user()?.id;
    if (!owner) return;
    const request = this.history
      .loadClientState(id, owner)
      .pipe(
        map((state) => this.validateState(state)),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (state) => {
          if (this.user()?.id !== owner) return;
          this.applyState(state);
          if (state.status !== 'pendiente' && this.pendingRejection()?.requestId === id) {
            this.pendingRejection.set(null);
            this.rejectionError.set(null);
          }
        },
        error: () => {
          if (this.user()?.id === owner) this.rejectionError.set('quoteSummary.stateError');
        },
      });
    this.stateRequests.add(request);
  }

  canReject(card: QuoteCard): boolean {
    return (
      card.state.status === 'pendiente' &&
      !card.state.selectionState?.acceptance &&
      !this.rejectionBusy() &&
      !this.pendingRejection()
    );
  }

  reject(card: QuoteCard): void {
    if (
      !this.canReject(card) ||
      !window.confirm(this.translations.translate('quoteSummary.rejectPrompt'))
    )
      return;
    const attempt = {
      requestId: card.request.id,
      quoteId: card.state.quoteId,
      key: crypto.randomUUID(),
    };
    this.pendingRejection.set(attempt);
    this.sendRejection(attempt);
  }

  retryRejection(): void {
    const attempt = this.pendingRejection();
    if (attempt && !this.rejectionBusy()) this.sendRejection(attempt);
  }

  private sendRejection(attempt: RejectionAttempt): void {
    const owner = this.user()?.id;
    if (!owner) return;
    this.rejectionBusy.set(true);
    this.rejectionError.set(null);
    this.rejectionRequest = this.history
      .reject(attempt.requestId, attempt.quoteId, attempt.key)
      .pipe(
        switchMap(() => this.history.loadClientState(attempt.requestId, owner)),
        map((state) => this.validateState(state)),
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.rejectionBusy.set(false)),
      )
      .subscribe({
        next: (state) => {
          if (this.user()?.id !== owner) return;
          this.applyState(state);
          if (state.status !== 'pendiente') this.pendingRejection.set(null);
          else this.rejectionError.set('quoteSummary.rejectUncertain');
        },
        error: (error: unknown) => {
          if (this.user()?.id !== owner) return;
          if (
            error instanceof HttpErrorResponse &&
            [400, 401, 403, 404, 409, 422].includes(error.status)
          ) {
            this.pendingRejection.set(null);
            this.rejectionError.set('quoteSummary.rejectChanged');
            this.refreshState(attempt.requestId);
          } else this.rejectionError.set('quoteSummary.rejectUncertain');
        },
      });
  }

  private validateState(state: QuoteHistoryEntry): QuoteHistoryEntry {
    const card = this.cardsState().find((item) => item.request.id === state.requestId);
    if (
      !card ||
      card.state.quoteId !== state.quoteId ||
      card.request.productId !== state.productId
    ) {
      throw new Error('Refreshed quote state does not match its historical details.');
    }
    return state;
  }

  private applyState(state: QuoteHistoryEntry): void {
    this.cardsState.update((cards) =>
      cards.map((card) => {
        if (
          card.request.id !== state.requestId ||
          ((card.state.status === 'completada' || card.state.status === 'rechazada') &&
            state.status !== card.state.status) ||
          Date.parse(state.updatedAt) < Date.parse(card.state.updatedAt)
        )
          return card;
        return { ...card, state, progress: continuation(state) };
      }),
    );
  }
}

interface RejectionAttempt {
  requestId: string;
  quoteId: string;
  key: string;
}
interface QuoteCard {
  request: QuoteRequestRecord;
  state: QuoteHistoryEntry;
  progress: ReturnType<typeof continuation>;
}
function continuation(state: QuoteHistoryEntry) {
  const terminal = state.status !== 'pendiente';
  const subscription = !!state.emissionStatus;
  const accepted = !!state.selectionState?.acceptance;
  return {
    status: state.status,
    requiresProfile: !terminal && !subscription && !accepted,
    path:
      state.status === 'completada'
        ? '/app/cotizaciones/suscripcion/detalle'
        : subscription
          ? '/app/cotizaciones/suscripcion'
          : accepted
            ? '/app/cotizaciones/aceptacion'
            : '/app/cotizaciones/ofertas',
    action:
      state.status === 'completada'
        ? 'viewSubscription'
        : subscription
          ? 'viewStatus'
          : accepted
            ? 'continueAcceptance'
            : 'viewOffers',
  };
}

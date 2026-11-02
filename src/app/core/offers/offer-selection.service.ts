import { computed, effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import {
  catchError,
  defer,
  finalize,
  map,
  Observable,
  Subject,
  Subscription,
  switchMap,
  take,
  takeUntil,
  tap,
  throwError,
} from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionChangedError } from '../auth/auth.errors';
import { QUOTE_REQUEST_STORAGE } from '../quotes/quote-request-storage.service';
import { profilingErrorKey } from '../profiling/profiling.errors';
import {
  OfferSelectionChangedError,
  OfferSelectionRequiredError,
  OfferUnavailableError,
} from './offer.errors';
import { OFFER_GATEWAY } from './offer.gateway';
import {
  InsuranceOffer,
  OfferCalculation,
  OfferSelectionReference,
  OfferSelectionState,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
  SelectedOfferRecord,
} from './offer.models';
import { OFFER_SELECTION_STORAGE } from './offer-selection-storage.service';

type OffersStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
interface SelectionScope {
  quoteId: string;
  userId: string | null;
  generation: number;
}

@Injectable({ providedIn: 'root' })
export class OfferSelectionService implements OnDestroy {
  private readonly gateway = inject(OFFER_GATEWAY);
  private readonly storage = inject(OFFER_SELECTION_STORAGE);
  private readonly quotes = inject(QUOTE_REQUEST_STORAGE);
  private readonly auth = inject(AuthService);
  private readonly cancelled = new Subject<void>();
  private loadRequest: Subscription | undefined;
  private generation = 0;
  private ownerId = this.auth.user()?.id ?? null;
  private readonly calculationState = signal<OfferCalculation | null>(null);
  private readonly statusState = signal<OffersStatus>('idle');
  private readonly canonicalState = signal<OfferSelectionState | null>(null);
  private readonly pendingSelection = signal<ProvisionalSelectionRequest | null>(null);
  private readonly savingState = signal(false);
  private readonly expandedOfferIdState = signal<string | null>(null);

  readonly calculation = this.calculationState.asReadonly();
  readonly errorKey = signal<string | null>(null);
  readonly status = this.statusState.asReadonly();
  readonly saving = this.savingState.asReadonly();
  readonly canRetrySelection = computed(() => this.pendingSelection() !== null);
  readonly expandedOfferId = this.expandedOfferIdState.asReadonly();
  readonly confirmedSelection = computed(() => this.canonicalState()?.acceptance ?? null);
  readonly provisionalSelection = computed(() => this.canonicalState()?.selection ?? null);
  readonly selectionReference = computed<OfferSelectionReference | null>(() => {
    const selection = this.provisionalSelection();
    return selection && !this.confirmedSelection()
      ? {
          quoteId: selection.quoteId,
          offerId: selection.offerId,
          offerVersion: selection.offerVersion,
          revision: selection.revision,
        }
      : null;
  });
  readonly availableOffers = computed(
    () => this.calculationState()?.offers.filter((offer) => this.isSelectable(offer)) ?? [],
  );
  readonly recommendedOffer = computed(
    () =>
      this.calculationState()?.offers.find(
        (offer) => offer.recommended && this.isSelectable(offer),
      ) ?? null,
  );
  readonly selectedOffer = computed(() => {
    const selection = this.confirmedSelection() ?? this.provisionalSelection();
    const offer = this.calculationState()?.offers.find(
      (item) => item.id === selection?.offerId && item.version === selection.offerVersion,
    );
    if (!offer || !selection) {
      return null;
    }
    return {
      ...offer,
      name: selection.offerName,
      premium: selection.premium,
      periodicity: selection.periodicity,
      status: this.confirmedSelection()
        ? ('accepted' as const)
        : (this.canonicalState()?.offerStatus ?? offer.status),
    };
  });
  readonly selectedOfferId = computed(() => this.selectedOffer()?.id ?? null);
  readonly canContinue = computed(() => {
    const offer = this.selectedOffer();
    const provisional = this.provisionalSelection();
    return (
      this.statusState() === 'ready' &&
      !this.savingState() &&
      !!offer &&
      (!!this.confirmedSelection() ||
        (!!provisional &&
          this.isSelectable(offer) &&
          Date.parse(provisional.validUntil) > Date.now()))
    );
  });

  constructor() {
    effect(() => {
      const ownerId = this.auth.user()?.id ?? null;
      if (ownerId !== this.ownerId) {
        untracked(() => {
          this.ownerId = ownerId;
          this.reset();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.cancelPending();
    this.cancelled.complete();
  }

  cancelPending(): void {
    this.generation++;
    this.cancelled.next();
    this.loadRequest?.unsubscribe();
    this.savingState.set(false);
    this.pendingSelection.set(null);
    if (this.statusState() === 'loading') {
      this.statusState.set('idle');
    }
  }

  load(): void {
    this.ownerId = this.auth.user()?.id ?? null;
    this.reset();
    const scope = this.scope();
    this.statusState.set('loading');
    this.loadRequest = defer(() => {
      if (!scope.quoteId) {
        throw new OfferSelectionRequiredError();
      }
      return this.gateway.loadOffers();
    })
      .pipe(
        switchMap((calculation) => {
          this.assertScope(scope);
          if (calculation.quoteId !== scope.quoteId) {
            throw new Error('The offers do not match the active quote.');
          }
          return this.gateway
            .loadSelectionState(scope.quoteId)
            .pipe(map((selection) => ({ calculation, selection })));
        }),
        tap(({ calculation, selection }) => {
          this.assertScope(scope);
          this.calculationState.set(calculation);
          this.receive(selection, scope);
        }),
        take(1),
        takeUntil(this.cancelled),
      )
      .subscribe({
        next: ({ calculation }) =>
          this.statusState.set(calculation.offers.length ? 'ready' : 'empty'),
        error: (error: unknown) => {
          console.error('Insurance offers could not be loaded.', error);
          this.calculationState.set(null);
          this.canonicalState.set(null);
          this.storage.clear();
          this.errorKey.set(profilingErrorKey(error));
          this.statusState.set('error');
        },
      });
  }

  selectOffer(offer: InsuranceOffer): Observable<ProvisionalOfferSelection> {
    return this.save(() => {
      if (!this.isSelectable(offer) || this.confirmedSelection()) {
        throw new OfferUnavailableError();
      }
      const scope = this.scope();
      this.pendingSelection.set(null);
      return this.refresh(scope).pipe(
        switchMap((state) => {
          if (state.acceptance) {
            throw new OfferSelectionChangedError();
          }
          const current = this.calculationState()?.offers.find(
            (item) => item.id === offer.id && item.version === offer.version,
          );
          if (!current || !this.isSelectable(current)) {
            throw new OfferUnavailableError();
          }
          const command: ProvisionalSelectionRequest = {
            quoteId: scope.quoteId,
            offerId: offer.id,
            offerVersion: offer.version,
            expectedRevision: state.selection?.revision ?? 0,
            idempotencyKey: crypto.randomUUID(),
          };
          this.pendingSelection.set(command);
          return this.writeSelection(command, scope);
        }),
      );
    });
  }

  retrySelection(): Observable<ProvisionalOfferSelection> {
    return this.save(() => {
      const command = this.pendingSelection();
      if (!command) {
        throw new OfferSelectionRequiredError();
      }
      return this.writeSelection(command, this.scope());
    });
  }

  toggleDetails(offerId: string): void {
    this.expandedOfferIdState.update((current) => (current === offerId ? null : offerId));
  }

  confirmSelected(
    expected: OfferSelectionReference | null = this.selectionReference(),
  ): Observable<SelectedOfferRecord> {
    return defer(() => {
      const scope = this.activeScope();
      if (!expected || expected.quoteId !== scope.quoteId) {
        throw new OfferSelectionRequiredError();
      }
      return this.refresh(scope).pipe(
        switchMap((state) => {
          if (state.acceptance || !sameReference(expected, this.selectionReference())) {
            throw new OfferSelectionChangedError();
          }
          if (!this.canContinue()) {
            throw new OfferUnavailableError();
          }
          return this.gateway
            .confirmSelection(
              expected.quoteId,
              expected.offerId,
              expected.offerVersion,
              expected.revision,
            )
            .pipe(
              catchError((error: unknown) => this.refreshConflict(error, scope)),
              tap((acceptance) => {
                this.assertScope(scope);
                if (
                  acceptance.quoteId !== expected.quoteId ||
                  acceptance.offerId !== expected.offerId ||
                  acceptance.offerVersion !== expected.offerVersion
                ) {
                  throw new Error('The accepted offer does not match the reviewed selection.');
                }
                this.receive(
                  {
                    ...state,
                    acceptance: { ...acceptance, confirmed: true },
                    offerStatus: 'accepted',
                  },
                  scope,
                );
              }),
            );
        }),
        take(1),
        takeUntil(this.cancelled),
      );
    });
  }

  requireAcceptedSelection(): Observable<SelectedOfferRecord> {
    return defer(() => {
      const expected = this.confirmedSelection();
      const scope = this.activeScope();
      if (!expected) {
        throw new OfferSelectionRequiredError();
      }
      return this.refresh(scope).pipe(
        map((state) => {
          const acceptance = state.acceptance;
          if (
            !acceptance ||
            acceptance.offerId !== expected.offerId ||
            acceptance.offerVersion !== expected.offerVersion
          ) {
            throw new OfferSelectionChangedError();
          }
          return acceptance;
        }),
        takeUntil(this.cancelled),
      );
    });
  }

  isSelectable(offer: InsuranceOffer): boolean {
    return offer.status === 'available' && Date.parse(offer.validUntil) > Date.now();
  }

  private save(
    action: () => Observable<ProvisionalOfferSelection>,
  ): Observable<ProvisionalOfferSelection> {
    return defer(() => {
      if (this.savingState() || this.statusState() !== 'ready') {
        throw new OfferSelectionRequiredError();
      }
      const scope = this.activeScope();
      this.savingState.set(true);
      return defer(action).pipe(
        tap({
          error: (error: unknown) => {
            if (
              error instanceof OfferSelectionChangedError ||
              error instanceof OfferUnavailableError
            ) {
              this.pendingSelection.set(null);
            }
          },
        }),
        take(1),
        takeUntil(this.cancelled),
        finalize(() => {
          if (scope.generation === this.generation) {
            this.savingState.set(false);
          }
        }),
      );
    });
  }

  private writeSelection(
    command: ProvisionalSelectionRequest,
    scope: SelectionScope,
  ): Observable<ProvisionalOfferSelection> {
    this.assertScope(scope);
    if (command.quoteId !== scope.quoteId) {
      throw new OfferSelectionChangedError();
    }
    return this.gateway.saveProvisionalSelection(command).pipe(
      catchError((error: unknown) => this.refreshConflict(error, scope)),
      // An idempotent replay may acknowledge A after B became current.
      switchMap(() => this.refresh(scope)),
      map((state) => {
        const selection = state.selection;
        if (
          state.acceptance ||
          !selection ||
          selection.offerId !== command.offerId ||
          selection.offerVersion !== command.offerVersion
        ) {
          throw new OfferSelectionChangedError();
        }
        if (state.offerStatus !== 'available' || Date.parse(selection.validUntil) <= Date.now()) {
          throw new OfferUnavailableError();
        }
        this.pendingSelection.set(null);
        return selection;
      }),
    );
  }

  private refreshConflict(error: unknown, scope: SelectionScope): Observable<never> {
    return error instanceof OfferSelectionChangedError
      ? this.refresh(scope).pipe(switchMap(() => throwError(() => error)))
      : throwError(() => error);
  }

  private refresh(scope: SelectionScope): Observable<OfferSelectionState> {
    this.assertScope(scope);
    return this.gateway
      .loadSelectionState(scope.quoteId)
      .pipe(tap((state) => this.receive(state, scope)));
  }

  private receive(state: OfferSelectionState, scope: SelectionScope): void {
    this.assertScope(scope);
    if (
      state.quoteId !== scope.quoteId ||
      (state.selection && state.selection.quoteId !== scope.quoteId) ||
      (state.acceptance && state.acceptance.quoteId !== scope.quoteId)
    ) {
      throw new Error('The selection state belongs to another quote.');
    }
    this.canonicalState.set(state);
    const current = state.acceptance ?? state.selection;
    if (current) {
      this.storage.write(current);
    } else {
      this.storage.clear();
    }
  }

  private scope(): SelectionScope {
    const userId = this.auth.user()?.id ?? null;
    if (userId !== this.ownerId) {
      this.ownerId = userId;
      this.reset();
    }

    return {
      quoteId: this.quotes.read()?.id ?? '',
      userId,
      generation: this.generation,
    };
  }

  private activeScope(): SelectionScope {
    const scope = this.scope();
    if (this.calculationState()?.quoteId !== scope.quoteId) {
      this.reset();
      throw new SessionChangedError();
    }
    return scope;
  }

  private assertScope(scope: SelectionScope): void {
    if (
      scope.generation !== this.generation ||
      scope.userId !== (this.auth.user()?.id ?? null) ||
      scope.quoteId !== this.quotes.read()?.id
    ) {
      throw new SessionChangedError();
    }
  }

  private reset(): void {
    this.cancelPending();
    this.calculationState.set(null);
    this.canonicalState.set(null);
    this.pendingSelection.set(null);
    this.expandedOfferIdState.set(null);
    this.errorKey.set(null);
    this.statusState.set('idle');
    this.storage.clear();
  }
}

export function sameReference(
  left: OfferSelectionReference | null,
  right: OfferSelectionReference | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.quoteId === right.quoteId &&
    left.offerId === right.offerId &&
    left.offerVersion === right.offerVersion &&
    left.revision === right.revision
  );
}

import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, map, Observable, switchMap, take, tap, throwError } from 'rxjs';
import { OfferSelectionRequiredError, OfferUnavailableError } from './offer.errors';
import { OFFER_GATEWAY } from './offer.gateway';
import { InsuranceOffer, OfferCalculation, SelectedOfferRecord } from './offer.models';
import { OFFER_SELECTION_STORAGE } from './offer-selection-storage.service';
import { profilingErrorKey } from '../profiling/profiling.errors';

type OffersStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

@Injectable({ providedIn: 'root' })
export class OfferSelectionService {
  private readonly gateway = inject(OFFER_GATEWAY);
  private readonly storage = inject(OFFER_SELECTION_STORAGE);
  private readonly calculationState = signal<OfferCalculation | null>(null);
  private readonly statusState = signal<OffersStatus>('idle');
  private readonly selectedOfferIdState = signal<string | null>(
    this.storage.read()?.offerId ?? null,
  );
  private readonly expandedOfferIdState = signal<string | null>(null);
  private readonly confirmedSelectionState = signal<SelectedOfferRecord | null>(
    this.storage.read(),
  );

  readonly calculation = this.calculationState.asReadonly();
  readonly errorKey = signal<string | null>(null);
  readonly status = this.statusState.asReadonly();
  readonly selectedOfferId = this.selectedOfferIdState.asReadonly();
  readonly expandedOfferId = this.expandedOfferIdState.asReadonly();
  readonly confirmedSelection = this.confirmedSelectionState.asReadonly();
  readonly availableOffers = computed(
    () => this.calculationState()?.offers.filter((offer) => this.isSelectable(offer)) ?? [],
  );
  readonly recommendedOffer = computed(
    () =>
      this.calculationState()?.offers.find(
        (offer) => offer.recommended && this.isSelectable(offer),
      ) ?? null,
  );
  readonly selectedOffer = computed(
    () =>
      this.calculationState()?.offers.find((offer) => offer.id === this.selectedOfferIdState()) ??
      null,
  );
  readonly canContinue = computed(() => {
    const selected = this.selectedOffer();
    return !!selected && this.isSelectable(selected);
  });

  load(): void {
    if (this.statusState() === 'loading') {
      return;
    }

    this.statusState.set('loading');
    this.errorKey.set(null);
    this.gateway
      .loadOffers()
      .pipe(
        switchMap((calculation) =>
          this.gateway
            .loadSelection(calculation.quoteId)
            .pipe(map((selection) => ({ calculation, selection }))),
        ),
        take(1),
        finalize(() => {
          if (this.statusState() === 'loading') {
            this.statusState.set('error');
          }
        }),
      )
      .subscribe({
        next: ({ calculation, selection }) => {
          this.calculationState.set(calculation);
          if (selection) {
            this.storage.write(selection);
          } else {
            this.storage.clear();
          }
          this.reconcileStoredSelection(calculation);
          this.statusState.set(calculation.offers.length ? 'ready' : 'empty');
        },
        error: (error: unknown) => {
          console.error('Insurance offers could not be loaded.', error);
          this.errorKey.set(profilingErrorKey(error));
          this.statusState.set('error');
        },
      });
  }

  selectOffer(offer: InsuranceOffer): boolean {
    if (!this.isSelectable(offer)) {
      return false;
    }

    const calculation = this.calculationState();
    if (!calculation) {
      return false;
    }

    const selection = createSelectionRecord(calculation.quoteId, offer);
    this.selectedOfferIdState.set(offer.id);
    this.confirmedSelectionState.set(selection);
    this.storage.write(selection);
    return true;
  }

  toggleDetails(offerId: string): void {
    this.expandedOfferIdState.update((current) => (current === offerId ? null : offerId));
  }

  confirmSelected(): Observable<SelectedOfferRecord> {
    const calculation = this.calculationState();
    const selected = this.selectedOffer();
    if (!calculation || !selected) {
      return throwError(() => new OfferSelectionRequiredError());
    }
    if (!this.isSelectable(selected)) {
      this.clearSelection();
      return throwError(() => new OfferUnavailableError());
    }

    return this.gateway.confirmSelection(calculation.quoteId, selected.id, selected.version).pipe(
      tap((selection) => {
        this.confirmedSelectionState.set(selection);
        this.storage.write(selection);
      }),
    );
  }

  isSelectable(offer: InsuranceOffer): boolean {
    return offer.status === 'available' && Date.parse(offer.validUntil) > Date.now();
  }

  private reconcileStoredSelection(calculation: OfferCalculation): void {
    const stored = this.storage.read();
    if (!stored || stored.quoteId !== calculation.quoteId) {
      this.clearSelection();
      return;
    }

    const currentOffer = calculation.offers.find((offer) => offer.id === stored.offerId);
    if (
      !currentOffer ||
      currentOffer.version !== stored.offerVersion ||
      !this.isSelectable(currentOffer)
    ) {
      this.clearSelection();
      return;
    }

    this.selectedOfferIdState.set(currentOffer.id);
    this.confirmedSelectionState.set(stored);
  }

  private clearSelection(): void {
    this.selectedOfferIdState.set(null);
    this.confirmedSelectionState.set(null);
    this.storage.clear();
  }
}

function createSelectionRecord(quoteId: string, offer: InsuranceOffer): SelectedOfferRecord {
  return {
    quoteId,
    offerId: offer.id,
    offerVersion: offer.version,
    offerName: offer.name,
    monthlyPremium: offer.monthlyPremium,
    currency: offer.currency,
    selectedAt: new Date().toISOString(),
  };
}

import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  isPremiumPeriodicity,
  Money,
  PremiumPeriodicity,
  SelectedOfferRecord,
} from './offer.models';

const SELECTION_KEY = 'solventa.offer.selection';

export interface OfferSelectionStorage {
  read(): SelectedOfferRecord | null;
  write(selection: SelectedOfferRecord): void;
  clear(): void;
}

export const OFFER_SELECTION_STORAGE = new InjectionToken<OfferSelectionStorage>(
  'OFFER_SELECTION_STORAGE',
);

@Injectable()
export class BrowserOfferSelectionStorage implements OfferSelectionStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): SelectedOfferRecord | null {
    const value = this.storage?.getItem(SELECTION_KEY);
    if (!value) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      const selection = toSelectionRecord(parsed);
      if (selection) {
        return selection;
      }
    } catch (error) {
      console.warn('Stored offer selection could not be parsed.', error);
    }

    this.clear();
    return null;
  }

  write(selection: SelectedOfferRecord): void {
    this.storage?.setItem(SELECTION_KEY, JSON.stringify(selection));
  }

  clear(): void {
    this.storage?.removeItem(SELECTION_KEY);
  }
}

function toSelectionRecord(value: unknown): SelectedOfferRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SelectedOfferRecord> & { monthlyPremium?: unknown };
  if (
    typeof candidate.quoteId !== 'string' ||
    typeof candidate.offerId !== 'string' ||
    typeof candidate.offerVersion !== 'number' ||
    typeof candidate.offerName !== 'string' ||
    typeof candidate.selectedAt !== 'string' ||
    (candidate.confirmed !== undefined && typeof candidate.confirmed !== 'boolean')
  ) {
    return null;
  }

  let premium: Money;
  let periodicity: PremiumPeriodicity;
  if ('premium' in candidate || 'periodicity' in candidate) {
    if (!isMoney(candidate.premium) || !isPremiumPeriodicity(candidate.periodicity)) {
      return null;
    }
    premium = candidate.premium;
    periodicity = candidate.periodicity;
  } else {
    if (!isMoney(candidate.monthlyPremium)) {
      return null;
    }
    premium = candidate.monthlyPremium;
    periodicity = 'mensual';
  }

  return {
    quoteId: candidate.quoteId,
    offerId: candidate.offerId,
    offerVersion: candidate.offerVersion,
    offerName: candidate.offerName,
    premium,
    periodicity,
    selectedAt: candidate.selectedAt,
    confirmed: candidate.confirmed ?? true,
  };
}

function isMoney(value: unknown): value is Money {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { amount?: unknown; currency?: unknown };
  return (
    typeof candidate.amount === 'number' &&
    Number.isFinite(candidate.amount) &&
    candidate.amount >= 0 &&
    typeof candidate.currency === 'string' &&
    /^[A-Z]{3}$/.test(candidate.currency)
  );
}

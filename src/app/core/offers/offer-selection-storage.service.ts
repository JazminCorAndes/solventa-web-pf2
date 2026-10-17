import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { SelectedOfferRecord } from './offer.models';

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
      if (isSelectionRecord(parsed)) {
        return parsed;
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

function isSelectionRecord(value: unknown): value is SelectedOfferRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SelectedOfferRecord>;
  return (
    typeof candidate.quoteId === 'string' &&
    typeof candidate.offerId === 'string' &&
    typeof candidate.offerVersion === 'number' &&
    typeof candidate.offerName === 'string' &&
    typeof candidate.monthlyPremium === 'number' &&
    (candidate.currency === 'UF' || candidate.currency === 'CLP' || candidate.currency === 'COP') &&
    typeof candidate.selectedAt === 'string'
  );
}

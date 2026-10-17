import { TestBed } from '@angular/core/testing';
import { PREMIUM_PERIODICITIES, SelectedOfferRecord } from './offer.models';
import { BrowserOfferSelectionStorage } from './offer-selection-storage.service';

const STORAGE_KEY = 'solventa.offer.selection';
const SELECTION: SelectedOfferRecord = {
  quoteId: 'quote-001',
  offerId: 'offer-001',
  offerVersion: 1,
  offerName: 'Plan Integral',
  premium: { amount: 48_000, currency: 'COP' },
  periodicity: 'mensual',
  selectedAt: '2026-10-17T00:00:00Z',
};

describe('BrowserOfferSelectionStorage', () => {
  let storage: BrowserOfferSelectionStorage;

  beforeEach(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [BrowserOfferSelectionStorage] });
    storage = TestBed.inject(BrowserOfferSelectionStorage);
  });

  afterEach(() => window.sessionStorage.removeItem(STORAGE_KEY));

  it.each(PREMIUM_PERIODICITIES)(
    'recupera una selección %s con su importe y moneda',
    (periodicity) => {
      const selection = { ...SELECTION, periodicity };
      storage.write(selection);

      expect(storage.read()).toEqual(selection);
      expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).not.toHaveProperty(
        'monthlyPremium',
      );
    },
  );

  it('migra una selección legada a mensual solo cuando faltan los campos nuevos', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quoteId: SELECTION.quoteId,
        offerId: SELECTION.offerId,
        offerVersion: SELECTION.offerVersion,
        offerName: SELECTION.offerName,
        monthlyPremium: SELECTION.premium,
        selectedAt: SELECTION.selectedAt,
      }),
    );

    expect(storage.read()).toEqual(SELECTION);
  });

  it.each([
    { premium: SELECTION.premium },
    { periodicity: 'por_viaje' },
    { premium: null, periodicity: 'por_vuelo' },
    { premium: SELECTION.premium, periodicity: 'diaria' },
  ])('no convierte una selección nueva inválida en mensual: %j', (fields) => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        quoteId: SELECTION.quoteId,
        offerId: SELECTION.offerId,
        offerVersion: SELECTION.offerVersion,
        offerName: SELECTION.offerName,
        monthlyPremium: SELECTION.premium,
        selectedAt: SELECTION.selectedAt,
        ...fields,
      }),
    );

    expect(storage.read()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

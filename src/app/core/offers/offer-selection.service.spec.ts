import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of } from 'rxjs';
import { OFFER_GATEWAY, OfferGateway } from './offer.gateway';
import { InsuranceOffer, OfferCalculation, SelectedOfferRecord } from './offer.models';
import { OfferSelectionService } from './offer-selection.service';
import { OFFER_SELECTION_STORAGE, OfferSelectionStorage } from './offer-selection-storage.service';

const AVAILABLE_OFFER: InsuranceOffer = {
  id: 'offer-a',
  version: 1,
  name: 'Oferta A',
  description: 'Oferta disponible',
  monthlyPremiumUf: 1.5,
  coverageLabel: 'Cobertura A',
  deductibleLabel: 'UF 3',
  validityLabel: 'Anual',
  liabilityLabel: 'UF 1.000',
  coverages: ['Cobertura principal'],
  conditions: ['Condición principal'],
  additionalBenefits: ['Asistencia'],
  recommended: true,
  status: 'available',
  validUntil: '2030-01-01T00:00:00.000Z',
};

const SECOND_OFFER: InsuranceOffer = {
  ...AVAILABLE_OFFER,
  id: 'offer-b',
  name: 'Oferta B',
  recommended: false,
};

const EXPIRED_OFFER: InsuranceOffer = {
  ...AVAILABLE_OFFER,
  id: 'offer-expired',
  name: 'Oferta vencida',
  recommended: false,
  status: 'expired',
  validUntil: '2020-01-01T00:00:00.000Z',
};

const CALCULATION: OfferCalculation = {
  quoteId: 'quote-001',
  calculatedAt: '2026-10-11T00:00:00.000Z',
  validUntil: '2030-01-01T00:00:00.000Z',
  appliedRate: 'Estándar',
  offers: [AVAILABLE_OFFER, SECOND_OFFER, EXPIRED_OFFER],
};

class TestOfferGateway implements OfferGateway {
  calculation: OfferCalculation = CALCULATION;

  loadOffers(): Observable<OfferCalculation> {
    return of(this.calculation);
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
  ): Observable<SelectedOfferRecord> {
    const offer = this.calculation.offers.find((item) => item.id === offerId)!;
    return of({
      quoteId,
      offerId,
      offerVersion,
      offerName: offer.name,
      monthlyPremiumUf: offer.monthlyPremiumUf,
      selectedAt: '2026-10-11T01:00:00.000Z',
    });
  }
}

class TestOfferSelectionStorage implements OfferSelectionStorage {
  selection: SelectedOfferRecord | null = null;

  read(): SelectedOfferRecord | null {
    return this.selection;
  }

  write(selection: SelectedOfferRecord): void {
    this.selection = selection;
  }

  clear(): void {
    this.selection = null;
  }
}

describe('OfferSelectionService', () => {
  let service: OfferSelectionService;
  let gateway: TestOfferGateway;
  let storage: TestOfferSelectionStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OfferSelectionService,
        { provide: OFFER_GATEWAY, useClass: TestOfferGateway },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
      ],
    });
    service = TestBed.inject(OfferSelectionService);
    gateway = TestBed.inject(OFFER_GATEWAY) as TestOfferGateway;
    storage = TestBed.inject(OFFER_SELECTION_STORAGE) as TestOfferSelectionStorage;
  });

  it('presents the available offers for comparison', () => {
    service.load();

    expect(service.status()).toBe('ready');
    expect(service.calculation()?.offers).toHaveLength(3);
    expect(service.availableOffers()).toHaveLength(2);
    expect(service.recommendedOffer()?.id).toBe('offer-a');
  });

  it('registers an available offer and enables continuation', () => {
    service.load();

    expect(service.selectOffer(AVAILABLE_OFFER)).toBe(true);

    expect(service.selectedOfferId()).toBe('offer-a');
    expect(service.canContinue()).toBe(true);
    expect(storage.selection?.offerName).toBe('Oferta A');
  });

  it('keeps only the latest selected offer', () => {
    service.load();
    service.selectOffer(AVAILABLE_OFFER);

    service.selectOffer(SECOND_OFFER);

    expect(service.selectedOfferId()).toBe('offer-b');
    expect(storage.selection?.offerId).toBe('offer-b');
  });

  it('reports an empty state without offers', () => {
    gateway.calculation = { ...CALCULATION, offers: [] };

    service.load();

    expect(service.status()).toBe('empty');
    expect(service.canContinue()).toBe(false);
  });

  it('prevents selecting an expired offer', () => {
    service.load();

    expect(service.selectOffer(EXPIRED_OFFER)).toBe(false);
    expect(service.selectedOfferId()).toBeNull();
    expect(service.canContinue()).toBe(false);
  });

  it('clears the selection when the offer version changes', () => {
    service.load();
    service.selectOffer(AVAILABLE_OFFER);
    gateway.calculation = {
      ...CALCULATION,
      offers: [{ ...AVAILABLE_OFFER, version: 2 }, SECOND_OFFER],
    };

    service.load();

    expect(service.selectedOfferId()).toBeNull();
    expect(storage.selection).toBeNull();
  });

  it('confirms the current selection for acceptance', async () => {
    service.load();
    service.selectOffer(AVAILABLE_OFFER);

    const confirmed = await firstValueFrom(service.confirmSelected());

    expect(confirmed.offerId).toBe('offer-a');
    expect(service.confirmedSelection()).toEqual(confirmed);
  });
});

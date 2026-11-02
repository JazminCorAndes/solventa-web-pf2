import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, Subject, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { QUOTE_REQUEST_STORAGE } from '../quotes/quote-request-storage.service';
import { OFFER_GATEWAY, OfferGateway } from './offer.gateway';
import {
  InsuranceOffer,
  OfferCalculation,
  OfferSelectionState,
  PREMIUM_PERIODICITIES,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
  SelectedOfferRecord,
} from './offer.models';
import { OfferSelectionService } from './offer-selection.service';
import { OFFER_SELECTION_STORAGE, OfferSelectionStorage } from './offer-selection-storage.service';
import { OfferSelectionChangedError, OfferUnavailableError } from './offer.errors';

const AVAILABLE_OFFER: InsuranceOffer = {
  id: 'offer-a',
  version: 1,
  name: 'Oferta A',
  description: 'Oferta disponible',
  premium: { amount: 149_900, currency: 'COP' },
  periodicity: 'mensual',
  coverageLabel: 'Cobertura A',
  deductibleLabel: '$500.000 COP',
  validityLabel: 'Anual',
  liabilityLabel: '$1.000.000.000 COP',
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
  state: OfferSelectionState = {
    quoteId: CALCULATION.quoteId,
    selection: null,
    acceptance: null,
    offerStatus: null,
  };

  loadOffers(): Observable<OfferCalculation> {
    return of(this.calculation);
  }

  loadSelection(): Observable<SelectedOfferRecord | null> {
    return of(this.state.acceptance);
  }

  loadSelectionState(): Observable<OfferSelectionState> {
    return of(structuredClone(this.state));
  }

  saveProvisionalSelection(
    command: ProvisionalSelectionRequest,
  ): Observable<ProvisionalOfferSelection> {
    const offer = this.calculation.offers.find((item) => item.id === command.offerId)!;
    const selection: ProvisionalOfferSelection = {
      quoteId: command.quoteId,
      offerId: command.offerId,
      offerVersion: command.offerVersion,
      offerName: offer.name,
      premium: offer.premium,
      periodicity: offer.periodicity,
      selectedAt: '2026-10-11T01:00:00.000Z',
      confirmed: false,
      revision: command.expectedRevision + 1,
      validUntil: offer.validUntil,
    };
    this.state = {
      quoteId: command.quoteId,
      selection,
      acceptance: null,
      offerStatus: 'available',
    };
    return of(selection);
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
  ): Observable<SelectedOfferRecord> {
    const offer = this.calculation.offers.find((item) => item.id === offerId)!;
    const acceptance: SelectedOfferRecord = {
      quoteId,
      offerId,
      offerVersion,
      offerName: offer.name,
      premium: offer.premium,
      periodicity: offer.periodicity,
      selectedAt: '2026-10-11T01:00:00.000Z',
      confirmed: true,
    };
    this.state = {
      ...this.state,
      acceptance,
      offerStatus: this.state.selection ? 'accepted' : null,
    };
    return of(acceptance);
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
  const user = signal<{ id: string } | null>({ id: 'customer-a' });
  const quoteStorage = { read: vi.fn(() => ({ id: CALCULATION.quoteId })) };

  beforeEach(() => {
    user.set({ id: 'customer-a' });
    quoteStorage.read.mockReturnValue({ id: CALCULATION.quoteId });
    TestBed.configureTestingModule({
      providers: [
        OfferSelectionService,
        { provide: OFFER_GATEWAY, useClass: TestOfferGateway },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
        { provide: AuthService, useValue: { user } },
        { provide: QUOTE_REQUEST_STORAGE, useValue: quoteStorage },
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

  it('persists an available offer without accepting it and enables continuation', async () => {
    service.load();

    const save = vi.spyOn(gateway, 'saveProvisionalSelection');
    const accept = vi.spyOn(gateway, 'confirmSelection');
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));

    expect(service.selectedOfferId()).toBe('offer-a');
    expect(service.canContinue()).toBe(true);
    expect(storage.selection?.offerName).toBe('Oferta A');
    expect(storage.selection?.confirmed).toBe(false);
    expect(save.mock.calls[0][0].expectedRevision).toBe(0);
    expect(service.provisionalSelection()?.revision).toBe(1);
    expect(accept).not.toHaveBeenCalled();
  });

  it('keeps only the latest canonical selection and uses a new key for A to B', async () => {
    service.load();
    const save = vi.spyOn(gateway, 'saveProvisionalSelection');
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));

    await firstValueFrom(service.selectOffer(SECOND_OFFER));

    expect(service.selectedOfferId()).toBe('offer-b');
    expect(storage.selection?.offerId).toBe('offer-b');
    expect(save.mock.calls.map(([command]) => command.expectedRevision)).toEqual([0, 1]);
    expect(save.mock.calls[0][0].idempotencyKey).not.toBe(save.mock.calls[1][0].idempotencyKey);
  });

  it('recovers the persisted provisional selection with empty local storage', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    storage.clear();

    service.load();

    expect(service.selectedOfferId()).toBe('offer-a');
    expect(service.confirmedSelection()).toBeNull();
    expect(storage.selection?.confirmed).toBe(false);
  });

  it('reports an empty state without offers', () => {
    gateway.calculation = { ...CALCULATION, offers: [] };

    service.load();

    expect(service.status()).toBe('empty');
    expect(service.canContinue()).toBe(false);
  });

  it('prevents selecting an expired offer', async () => {
    service.load();

    await expect(firstValueFrom(service.selectOffer(EXPIRED_OFFER))).rejects.toBeInstanceOf(
      OfferUnavailableError,
    );
    expect(service.selectedOfferId()).toBeNull();
    expect(service.canContinue()).toBe(false);
  });

  it('does not expose a previous selection after loading another request fails', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    vi.spyOn(gateway, 'loadOffers').mockReturnValueOnce(throwError(() => new Error('offline')));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    service.load();

    expect(service.status()).toBe('error');
    expect(service.selectedOffer()).toBeNull();
    expect(service.canContinue()).toBe(false);
    expect(service.calculation()).toBeNull();
    log.mockRestore();
  });

  it('does not treat a provisional selection for an old offer version as selectable', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    gateway.calculation = {
      ...CALCULATION,
      offers: [{ ...AVAILABLE_OFFER, version: 2 }, SECOND_OFFER],
    };

    service.load();

    expect(service.selectedOfferId()).toBeNull();
    expect(service.canContinue()).toBe(false);
    expect(storage.selection?.offerVersion).toBe(1);
    expect(storage.selection?.confirmed).toBe(false);
  });

  it('confirms the current selection for acceptance', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    const accept = vi.spyOn(gateway, 'confirmSelection');

    const confirmed = await firstValueFrom(service.confirmSelected());

    expect(confirmed.offerId).toBe('offer-a');
    expect(service.confirmedSelection()).toEqual({ ...confirmed, confirmed: true });
    expect(accept).toHaveBeenCalledWith(
      CALCULATION.quoteId,
      AVAILABLE_OFFER.id,
      AVAILABLE_OFFER.version,
      1,
    );
  });

  it('restores an accepted offer as the confirmed selection', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    await firstValueFrom(service.confirmSelected());
    gateway.calculation = {
      ...CALCULATION,
      offers: [{ ...AVAILABLE_OFFER, status: 'accepted' }, SECOND_OFFER],
    };

    service.load();

    expect(service.selectedOffer()?.status).toBe('accepted');
    expect(service.confirmedSelection()?.offerId).toBe(AVAILABLE_OFFER.id);
    expect(service.canContinue()).toBe(true);
  });

  it('uses a legacy acceptance even without provisional selection or offer status', async () => {
    const acceptance = await firstValueFrom(
      gateway.confirmSelection(CALCULATION.quoteId, AVAILABLE_OFFER.id, AVAILABLE_OFFER.version),
    );
    const confirm = vi.spyOn(gateway, 'confirmSelection');
    storage.selection = { ...acceptance, offerId: SECOND_OFFER.id, confirmed: false };

    service.load();

    expect(service.provisionalSelection()).toBeNull();
    expect(service.confirmedSelection()).toEqual(acceptance);
    expect(service.selectedOfferId()).toBe(AVAILABLE_OFFER.id);
    expect(service.selectionReference()).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    await expect(firstValueFrom(service.selectOffer(SECOND_OFFER))).rejects.toBeInstanceOf(
      OfferUnavailableError,
    );
  });

  it('does not recover a cached draft as a selection when the canonical state is empty', () => {
    storage.selection = {
      quoteId: CALCULATION.quoteId,
      offerId: AVAILABLE_OFFER.id,
      offerVersion: 1,
      offerName: AVAILABLE_OFFER.name,
      premium: AVAILABLE_OFFER.premium,
      periodicity: AVAILABLE_OFFER.periodicity,
      selectedAt: CALCULATION.calculatedAt,
      confirmed: false,
    };
    service.load();
    expect(service.selectedOffer()).toBeNull();
    expect(storage.selection).toBeNull();
  });

  it('retries a lost provisional receipt with the exact same key and body', async () => {
    service.load();
    const write = gateway.saveProvisionalSelection.bind(gateway);
    const save = vi
      .spyOn(gateway, 'saveProvisionalSelection')
      .mockImplementationOnce((command) =>
        write(command).pipe(switchMap(() => throwError(() => new Error('lost receipt')))),
      );
    await expect(firstValueFrom(service.selectOffer(AVAILABLE_OFFER))).rejects.toThrow(
      'lost receipt',
    );
    expect(service.canRetrySelection()).toBe(true);
    const receipt = gateway.state.selection!;
    save.mockReturnValueOnce(of(receipt));

    await expect(firstValueFrom(service.retrySelection())).resolves.toEqual(receipt);

    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(service.canRetrySelection()).toBe(false);
    expect(service.confirmedSelection()).toBeNull();
  });

  it('keeps canonical B when replaying the old acknowledgment of A', async () => {
    service.load();
    const write = gateway.saveProvisionalSelection.bind(gateway);
    const save = vi
      .spyOn(gateway, 'saveProvisionalSelection')
      .mockImplementationOnce((command) =>
        write(command).pipe(switchMap(() => throwError(() => new Error('lost receipt')))),
      );
    await expect(firstValueFrom(service.selectOffer(AVAILABLE_OFFER))).rejects.toThrow(
      'lost receipt',
    );
    const receiptA = gateway.state.selection!;
    await firstValueFrom(
      write({
        quoteId: CALCULATION.quoteId,
        offerId: SECOND_OFFER.id,
        offerVersion: SECOND_OFFER.version,
        expectedRevision: 1,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    save.mockReturnValueOnce(of(receiptA));

    await expect(firstValueFrom(service.retrySelection())).rejects.toBeInstanceOf(
      OfferSelectionChangedError,
    );

    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(service.selectedOfferId()).toBe(SECOND_OFFER.id);
    expect(service.provisionalSelection()?.revision).toBe(2);
    expect(service.confirmedSelection()).toBeNull();
    expect(service.canRetrySelection()).toBe(false);
  });

  it.each([SECOND_OFFER, AVAILABLE_OFFER])(
    'refuses a stale confirmation when the canonical reference or revision changed: $id',
    async (offer) => {
      service.load();
      await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
      const reviewed = service.selectionReference();
      await firstValueFrom(
        gateway.saveProvisionalSelection({
          quoteId: CALCULATION.quoteId,
          offerId: offer.id,
          offerVersion: offer.version,
          expectedRevision: 1,
          idempotencyKey: crypto.randomUUID(),
        }),
      );
      const confirm = vi.spyOn(gateway, 'confirmSelection');

      await expect(firstValueFrom(service.confirmSelected(reviewed))).rejects.toBeInstanceOf(
        OfferSelectionChangedError,
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(service.selectionReference()?.revision).toBe(2);
      expect(service.confirmedSelection()).toBeNull();
    },
  );

  it('refreshes a conflict during acceptance without inventing success', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    const refresh = vi.spyOn(gateway, 'loadSelectionState');
    vi.spyOn(gateway, 'confirmSelection').mockReturnValueOnce(
      throwError(() => new OfferSelectionChangedError()),
    );
    await expect(firstValueFrom(service.confirmSelected())).rejects.toBeInstanceOf(
      OfferSelectionChangedError,
    );
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(service.confirmedSelection()).toBeNull();
  });

  it('does not accept if the canonical read fails', async () => {
    service.load();
    await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    const confirm = vi.spyOn(gateway, 'confirmSelection');
    vi.spyOn(gateway, 'loadSelectionState').mockReturnValueOnce(
      throwError(() => new Error('offline')),
    );
    await expect(firstValueFrom(service.confirmSelected())).rejects.toThrow('offline');
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['expired', 'withdrawn'] as const)(
    'does not accept a %s provisional selection',
    async (offerStatus) => {
      service.load();
      await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
      gateway.state = { ...gateway.state, offerStatus };
      const confirm = vi.spyOn(gateway, 'confirmSelection');
      await expect(firstValueFrom(service.confirmSelected())).rejects.toBeInstanceOf(
        OfferUnavailableError,
      );
      expect(confirm).not.toHaveBeenCalled();
      expect(service.canContinue()).toBe(false);
    },
  );

  it('does not apply an old calculation to a newly active quote', async () => {
    service.load();
    const read = vi.spyOn(gateway, 'loadSelectionState');
    const save = vi.spyOn(gateway, 'saveProvisionalSelection');
    quoteStorage.read.mockReturnValue({ id: 'another-quote' });
    await expect(firstValueFrom(service.selectOffer(AVAILABLE_OFFER))).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(service.calculation()).toBeNull();
    expect(storage.selection).toBeNull();
  });

  it('cancels a pending canonical read when the authenticated user changes', () => {
    const pending = new Subject<OfferSelectionState>();
    vi.spyOn(gateway, 'loadSelectionState').mockReturnValueOnce(pending);
    service.load();
    user.set({ id: 'customer-b' });
    TestBed.tick();
    pending.next(gateway.state);
    expect(service.status()).toBe('idle');
    expect(service.calculation()).toBeNull();
    expect(storage.selection).toBeNull();
  });

  it('ignores a late provisional receipt after cancellation', async () => {
    service.load();
    const first = await firstValueFrom(service.selectOffer(AVAILABLE_OFFER));
    const pending = new Subject<ProvisionalOfferSelection>();
    vi.spyOn(gateway, 'saveProvisionalSelection').mockReturnValueOnce(pending);
    const received = vi.fn();
    service.selectOffer(SECOND_OFFER).subscribe(received);
    expect(service.saving()).toBe(true);
    service.cancelPending();
    pending.next({ ...first, offerId: SECOND_OFFER.id, revision: 2 });
    expect(received).not.toHaveBeenCalled();
    expect(service.saving()).toBe(false);
    expect(service.canRetrySelection()).toBe(false);
    expect(service.selectedOfferId()).toBe(AVAILABLE_OFFER.id);
  });

  it.each(PREMIUM_PERIODICITIES)(
    'conserva el importe %s al seleccionar y confirmar',
    async (periodicity) => {
      const offer = { ...AVAILABLE_OFFER, periodicity };
      gateway.calculation = { ...CALCULATION, offers: [offer] };
      service.load();

      await firstValueFrom(service.selectOffer(offer));
      expect(storage.selection?.periodicity).toBe(periodicity);
      expect(storage.selection?.premium).toEqual(offer.premium);

      const confirmed = await firstValueFrom(service.confirmSelected());
      expect(confirmed.periodicity).toBe(periodicity);
      expect(service.confirmedSelection()?.periodicity).toBe(periodicity);
      expect(storage.selection).toEqual(confirmed);
    },
  );
});

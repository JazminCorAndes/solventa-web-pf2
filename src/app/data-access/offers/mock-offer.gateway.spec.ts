import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  OFFER_SELECTION_STORAGE,
  OfferSelectionStorage,
} from '../../core/offers/offer-selection-storage.service';
import { SelectedOfferRecord } from '../../core/offers/offer.models';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import {
  QUOTE_REQUEST_STORAGE,
  QuoteRequestStorage,
} from '../../core/quotes/quote-request-storage.service';
import { MockOfferGateway } from './mock-offer.gateway';
import { OfferSelectionChangedError, OfferUnavailableError } from '../../core/offers/offer.errors';
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';
import { createProfile } from '../../core/profiling/profiling.fixtures';
import { ProfilingError } from '../../core/profiling/profiling.errors';

const REQUEST: QuoteRequestRecord = {
  id: 'AQT-2026-654321',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
  productId: 'automotive',
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '12345678-9',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@solventa.co',
  phone: '912345678',
};

class TestQuoteRequestStorage implements QuoteRequestStorage {
  request: QuoteRequestRecord | null = REQUEST;
  read(): QuoteRequestRecord | null {
    return this.request;
  }
  write(): void {}
  clear(): void {}
}

class TestOfferSelectionStorage implements OfferSelectionStorage {
  selection: SelectedOfferRecord | null = null;

  read(): SelectedOfferRecord | null {
    return this.selection;
  }
  write(value: SelectedOfferRecord): void {
    this.selection = value;
  }
  clear(): void {
    this.selection = null;
  }
}

describe('MockOfferGateway', () => {
  let gateway: MockOfferGateway;
  let storage: TestQuoteRequestStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MockOfferGateway,
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: TestOfferSelectionStorage },
        {
          provide: MockProfilingGateway,
          useValue: { loadProfile: () => of(createProfile(REQUEST.id)) },
        },
      ],
    });
    gateway = TestBed.inject(MockOfferGateway);
    storage = TestBed.inject(QUOTE_REQUEST_STORAGE) as TestQuoteRequestStorage;
  });

  it('uses the latest request identifier in the calculated offers', async () => {
    const calculation = await firstValueFrom(gateway.loadOffers());

    expect(calculation.quoteId).toBe('AQT-2026-654321');
    expect(calculation.offers).toHaveLength(3);
    expect(calculation.offers.every((offer) => offer.status === 'available')).toBe(true);
  });

  it('keeps canonical B after an old A replay and preserves terminal acceptance after cache clearing', async () => {
    const calculation = await firstValueFrom(gateway.loadOffers());
    const [offerA, offerB] = calculation.offers;
    const commandA = {
      quoteId: REQUEST.id,
      offerId: offerA.id,
      offerVersion: offerA.version,
      expectedRevision: 0,
      idempotencyKey: crypto.randomUUID(),
    };
    const receiptA = await firstValueFrom(gateway.saveProvisionalSelection(commandA));
    const commandB = {
      ...commandA,
      offerId: offerB.id,
      expectedRevision: 1,
      idempotencyKey: crypto.randomUUID(),
    };
    await firstValueFrom(gateway.saveProvisionalSelection(commandB));
    await expect(firstValueFrom(gateway.saveProvisionalSelection(commandA))).resolves.toEqual(
      receiptA,
    );
    let state = await firstValueFrom(gateway.loadSelectionState(REQUEST.id));
    expect(state.selection?.offerId).toBe(offerB.id);
    expect(state.selection?.revision).toBe(2);
    expect(state.acceptance).toBeNull();

    await expect(
      firstValueFrom(gateway.confirmSelection(REQUEST.id, offerB.id, 1)),
    ).rejects.toBeInstanceOf(OfferSelectionChangedError);
    await firstValueFrom(gateway.confirmSelection(REQUEST.id, offerB.id, 1, 2));
    TestBed.inject(OFFER_SELECTION_STORAGE).clear();
    await expect(
      firstValueFrom(
        gateway.saveProvisionalSelection({
          ...commandB,
          expectedRevision: 2,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(OfferSelectionChangedError);
    await expect(firstValueFrom(gateway.saveProvisionalSelection(commandA))).resolves.toEqual(
      receiptA,
    );

    state = await firstValueFrom(gateway.loadSelectionState(REQUEST.id));
    expect(state.selection?.offerId).toBe(offerB.id);
    expect(state.acceptance?.offerId).toBe(offerB.id);
    expect(state.acceptance?.confirmed).toBe(true);
    expect(state.offerStatus).toBe('accepted');
  });

  it('rejects a changed payload under the same provisional key', async () => {
    const calculation = await firstValueFrom(gateway.loadOffers());
    const [offerA, offerB] = calculation.offers;
    const command = {
      quoteId: REQUEST.id,
      offerId: offerA.id,
      offerVersion: offerA.version,
      expectedRevision: 0,
      idempotencyKey: crypto.randomUUID(),
    };
    await firstValueFrom(gateway.saveProvisionalSelection(command));
    await expect(
      firstValueFrom(
        gateway.saveProvisionalSelection({
          ...command,
          offerId: offerB.id,
        }),
      ),
    ).rejects.toThrow('idempotency key');
    expect((await firstValueFrom(gateway.loadSelectionState(REQUEST.id))).selection?.offerId).toBe(
      offerA.id,
    );
  });

  it.each(['load', 'confirm'])('rechaza %s sin un perfil vigente', async (operation) => {
    vi.spyOn(TestBed.inject(MockProfilingGateway), 'loadProfile').mockReturnValue(
      throwError(() => new ProfilingError('perfil_vencido')),
    );

    const result =
      operation === 'load'
        ? firstValueFrom(gateway.loadOffers())
        : firstValueFrom(gateway.confirmSelection(REQUEST.id, 'automotive-pro', 1));

    await expect(result).rejects.toMatchObject({ code: 'perfil_vencido' });
  });

  it('restores accepted offers only for the matching quote', async () => {
    const selectionStorage = TestBed.inject(OFFER_SELECTION_STORAGE) as TestOfferSelectionStorage;
    const calculation = await firstValueFrom(gateway.loadOffers());
    const offer = calculation.offers[0];
    selectionStorage.selection = await firstValueFrom(
      gateway.confirmSelection(REQUEST.id, offer.id, offer.version),
    );

    const accepted = await firstValueFrom(gateway.loadOffers());
    expect(accepted.offers[0].status).toBe('accepted');
    expect(await firstValueFrom(gateway.loadSelection())).toEqual(selectionStorage.selection);

    storage.request = { ...REQUEST, id: 'another-quote' };
    const otherQuote = await firstValueFrom(gateway.loadOffers());
    expect(otherQuote.offers.every((item) => item.status === 'available')).toBe(true);
  });

  it.each([
    'automotive',
    'travel',
    'life',
    'device-protection',
    'parametric',
    'parametric-weather',
    'payment-protection',
    'mortgage-life',
  ])('ofrece y confirma planes propios de %s en COP', async (productId) => {
    storage.request = {
      ...REQUEST,
      productId,
      productData:
        productId === 'parametric-weather'
          ? {
              location: 'Villavicencio, Meta',
              weatherEvent: 'heavy-rain',
              insuredAmount: '10000000',
              startDate: '2028-01-01',
              endDate: '2028-02-01',
            }
          : {},
    };
    const calculation = await firstValueFrom(gateway.loadOffers());
    expect(calculation.offers).toHaveLength(3);
    expect(calculation.appliedRate).toBe('Tarifa del plan');
    expect(JSON.stringify(calculation.offers)).not.toMatch(
      /demostraci[oó]n|simulad|pendiente de implementar|trabajo en proceso/i,
    );
    expect(calculation.offers.every((offer) => offer.id.startsWith(`${productId}-`))).toBe(true);
    expect(calculation.offers.every((offer) => offer.premium.currency === 'COP')).toBe(true);
    const periodicity =
      productId === 'travel'
        ? 'por_viaje'
        : productId === 'parametric'
          ? 'por_vuelo'
          : productId === 'parametric-weather'
            ? 'por_periodo'
            : 'mensual';
    expect(calculation.offers.every((offer) => offer.periodicity === periodicity)).toBe(true);
    if (productId !== 'automotive') {
      expect(calculation.offers.some((offer) => offer.name.includes('Automotriz'))).toBe(false);
    }
    const offer = calculation.offers[0];
    const selection = await firstValueFrom(
      gateway.confirmSelection(REQUEST.id, offer.id, offer.version),
    );
    expect(selection.offerId).toBe(offer.id);
    expect(selection.premium).toEqual(offer.premium);
    expect(selection.periodicity).toBe(periodicity);
  });

  it.each(['missed-connection', 'comprehensive'])(
    'respeta la cobertura de vuelo %s',
    async (coverageType) => {
      storage.request = { ...REQUEST, productId: 'parametric', productData: { coverageType } };
      const calculation = await firstValueFrom(gateway.loadOffers());
      expect(
        calculation.offers.every((offer) =>
          offer.coverages.some((coverage) => coverage.includes('conexión')),
        ),
      ).toBe(true);
    },
  );

  it('no incluye lluvia en planes solicitados para sequía', async () => {
    storage.request = {
      ...REQUEST,
      productId: 'parametric-weather',
      productData: {
        weatherEvent: 'drought',
        location: 'Villavicencio, Meta',
        insuredAmount: '10000000',
        startDate: '2028-01-01',
        endDate: '2028-02-01',
      },
    };
    const calculation = await firstValueFrom(gateway.loadOffers());
    expect(calculation.offers.every((offer) => offer.coverageLabel === 'Sequía')).toBe(true);
    expect(calculation.offers.every((offer) => offer.liabilityLabel.includes('10.000.000'))).toBe(
      true,
    );
    expect(
      calculation.offers.every((offer) => offer.validityLabel === '2028-01-01 a 2028-02-01'),
    ).toBe(true);
  });

  it('rechaza productos desconocidos en lugar de devolver ofertas automotrices', async () => {
    storage.request = { ...REQUEST, productId: 'desconocido' };
    await expect(firstValueFrom(gateway.loadOffers())).rejects.toBeInstanceOf(
      OfferUnavailableError,
    );
  });

  it('no confirma una oferta de otra solicitud', async () => {
    await expect(
      firstValueFrom(gateway.confirmSelection('otra-solicitud', 'automotive-pro', 1)),
    ).rejects.toBeInstanceOf(OfferUnavailableError);
  });

  it('exige una solicitud antes de cargar ofertas', async () => {
    storage.request = null;
    await expect(firstValueFrom(gateway.loadOffers())).rejects.toBeInstanceOf(
      OfferUnavailableError,
    );
  });
});

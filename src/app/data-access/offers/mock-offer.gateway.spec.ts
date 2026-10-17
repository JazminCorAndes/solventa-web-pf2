import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
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
import { OfferUnavailableError } from '../../core/offers/offer.errors';

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
  write(): void {}
  clear(): void {}
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

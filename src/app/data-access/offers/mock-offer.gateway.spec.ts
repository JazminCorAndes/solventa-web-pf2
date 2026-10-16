import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
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
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';
import { createProfile } from '../../core/profiling/profiling.fixtures';

const REQUEST: QuoteRequestRecord = {
  id: 'AQT-2026-654321',
  status: 'received',
  createdAt: '2026-10-11T12:00:00.000Z',
  productId: 'automotive',
  customerType: 'natural',
  nationalId: '12345678-9',
  vehiclePlate: 'ABC123',
  email: 'cliente@solventa.co',
  phone: '912345678',
};

class TestQuoteRequestStorage implements QuoteRequestStorage {
  read(): QuoteRequestRecord {
    return REQUEST;
  }
  write(): void {}
  clear(): void {}
}

class TestOfferSelectionStorage implements OfferSelectionStorage {
  read(): SelectedOfferRecord | null {
    return null;
  }
  write(): void {}
  clear(): void {}
}

describe('MockOfferGateway', () => {
  it('uses the latest request identifier in the calculated offers', async () => {
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
    const gateway = TestBed.inject(MockOfferGateway);

    const calculation = await firstValueFrom(gateway.loadOffers());

    expect(calculation.quoteId).toBe('AQT-2026-654321');
  });
});

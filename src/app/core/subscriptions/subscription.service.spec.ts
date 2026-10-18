import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { QUOTE_REQUEST_STORAGE } from '../quotes/quote-request-storage.service';
import { SUBSCRIPTION_GATEWAY } from './subscription.gateway';
import { IssuanceSagaStatus, SubscriptionRecord, SubscriptionStatus } from './subscription.models';
import { SubscriptionService } from './subscription.service';
import { BrowserSubscriptionStorage, SUBSCRIPTION_STORAGE } from './subscription-storage.service';

const STORAGE_KEY = 'solventa.subscription';
const SUBSCRIPTION: SubscriptionRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  quoteId: 'AQT-2026-ABCDEF1234',
  offerId: '20000000-0000-4000-8000-000000000001',
  offerVersion: 1,
  status: 'approved',
  ruleVersion: 'suscripcion-automatica-2026.1',
  createdAt: '2026-10-16T15:00:00Z',
  updatedAt: '2026-10-16T15:00:00Z',
  decision: {
    result: 'approved',
    ruleVersion: 'suscripcion-automatica-2026.1',
    decisionHash: 'a'.repeat(64),
    decidedAt: '2026-10-16T15:00:00Z',
  },
  saga: {
    status: 'payment_pending',
    version: 1,
    updatedAt: '2026-10-16T15:00:00Z',
  },
};

describe('BrowserSubscriptionStorage', () => {
  let storage: BrowserSubscriptionStorage;

  beforeEach(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [BrowserSubscriptionStorage] });
    storage = TestBed.inject(BrowserSubscriptionStorage);
  });

  afterEach(() => window.sessionStorage.removeItem(STORAGE_KEY));

  const statuses: SubscriptionStatus[] = ['approved', 'review', 'rejected'];
  const sagaStatuses: IssuanceSagaStatus[] = [
    'payment_pending',
    'payment_confirmed',
    'issued',
    'failed',
  ];
  it.each(statuses.flatMap((status) => sagaStatuses.map((saga) => ({ status, saga }))))(
    'restores $status with saga $saga without changing the decision',
    ({ status, saga }) => {
      const record: SubscriptionRecord = {
        ...SUBSCRIPTION,
        status,
        decision: { ...SUBSCRIPTION.decision, result: status },
        saga: { ...SUBSCRIPTION.saga, status: saga },
      };
      storage.write(record);
      expect(storage.read()).toEqual(record);
    },
  );

  it.each([
    { status: 'unknown' },
    { decision: { ...SUBSCRIPTION.decision, result: 'unknown' } },
    { decision: { ...SUBSCRIPTION.decision, result: 'review' } },
    { decision: { ...SUBSCRIPTION.decision, decisionHash: 'invalid' } },
    { saga: { ...SUBSCRIPTION.saga, status: 'unknown' } },
    { saga: null },
    { offerVersion: null },
  ])('clears malformed records %j', (fields) => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...SUBSCRIPTION, ...fields }));
    expect(storage.read()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  const gateway = { load: vi.fn(), start: vi.fn() };
  const quoteStorage = { read: vi.fn() };
  const storage = { read: vi.fn(), write: vi.fn(), clear: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    storage.read.mockReturnValue(SUBSCRIPTION);
    quoteStorage.read.mockReturnValue({ id: SUBSCRIPTION.quoteId });
    gateway.load.mockReturnValue(of(SUBSCRIPTION));
    gateway.start.mockReturnValue(of(SUBSCRIPTION));
    TestBed.configureTestingModule({
      providers: [
        SubscriptionService,
        { provide: SUBSCRIPTION_GATEWAY, useValue: gateway },
        { provide: QUOTE_REQUEST_STORAGE, useValue: quoteStorage },
        { provide: SUBSCRIPTION_STORAGE, useValue: storage },
      ],
    });
    service = TestBed.inject(SubscriptionService);
  });

  it('clears cached approval while refreshing and replaces it with the current decision', () => {
    const response = new Subject<SubscriptionRecord | null>();
    gateway.load.mockReturnValue(response);
    service.load();
    expect(service.subscription()).toBeNull();
    expect(service.loading()).toBe(true);
    expect(storage.clear).toHaveBeenCalled();
    const current: SubscriptionRecord = {
      ...SUBSCRIPTION,
      status: 'review',
      decision: { ...SUBSCRIPTION.decision, result: 'review' },
    };
    response.next(current);
    response.complete();
    expect(service.subscription()).toEqual(current);
    expect(service.loading()).toBe(false);
    expect(storage.write).toHaveBeenCalledWith(current);
  });

  it('does not preserve cached approval after an error and supports retry', () => {
    gateway.load.mockReturnValueOnce(throwError(() => new Error('Unavailable')));
    service.load();
    expect(service.error()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.subscription()).toBeNull();
    service.load();
    expect(service.error()).toBe(false);
    expect(service.subscription()).toEqual(SUBSCRIPTION);
  });

  it('removes a stale subscription when the backend returns null', () => {
    gateway.load.mockReturnValue(of(null));
    service.load();
    expect(service.subscription()).toBeNull();
    expect(service.error()).toBe(false);
    expect(service.loading()).toBe(false);
    expect(storage.clear).toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('does not show a cached subscription without a current quote', () => {
    quoteStorage.read.mockReturnValue(null);
    service.load();
    expect(service.subscription()).toBeNull();
    expect(service.error()).toBe(true);
    expect(service.loading()).toBe(false);
    expect(gateway.load).not.toHaveBeenCalled();
  });

  it('persists a newly started subscription', async () => {
    await expect(firstValueFrom(service.start())).resolves.toEqual(SUBSCRIPTION);
    expect(gateway.start).toHaveBeenCalledWith(SUBSCRIPTION.quoteId);
    expect(storage.write).toHaveBeenCalledWith(SUBSCRIPTION);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe(false);
  });
});

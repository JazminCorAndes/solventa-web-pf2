import { DASHBOARD_SNAPSHOT } from '../dashboard/dashboard.testing';
import { quoteProgress } from './quote-progress';

describe('quoteProgress', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');

  it('does not confuse an expired quote with an expired subscription', () => {
    expect(quoteProgress('request-001', DASHBOARD_SNAPSHOT, now).status).toBe('active');
  });

  it.each([
    ['2026-10-18T12:00:01Z', 'active'],
    ['2026-10-18T12:00:00Z', 'expired'],
    ['2026-10-18T11:59:59Z', 'expired'],
    [null, 'active'],
    [undefined, 'active'],
  ])('uses the exclusive coverage end %s for paid subscriptions', (validUntil, expected) => {
    const snapshot = {
      ...DASHBOARD_SNAPSHOT,
      subscriptions: DASHBOARD_SNAPSHOT.subscriptions.map((item) => ({ ...item, validUntil })),
    };
    expect(quoteProgress('request-001', snapshot, now).status).toBe(expected);
  });

  it('never expires an unpaid request even when a coverage date is present', () => {
    const snapshot = {
      ...DASHBOARD_SNAPSHOT,
      payments: [],
      subscriptions: DASHBOARD_SNAPSHOT.subscriptions.map((item) => ({
        ...item,
        validUntil: '2000-01-01T00:00:00Z',
        saga: { ...item.saga, status: 'pago_pendiente' },
      })),
    };
    expect(quoteProgress('request-001', snapshot, now)).toMatchObject({
      status: 'inProgress',
      action: 'proceedToPayment',
    });
  });

  it.each(['revision', 'rechazada'])(
    'resumes underwriting status %s rather than payment',
    (status) => {
      const snapshot = {
        ...DASHBOARD_SNAPSHOT,
        payments: [],
        subscriptions: DASHBOARD_SNAPSHOT.subscriptions.map((item) => ({
          ...item,
          status,
          saga: { ...item.saga, status: 'pago_pendiente' },
        })),
      };
      expect(quoteProgress('request-001', snapshot, now).action).toBe('viewStatus');
    },
  );

  it('recognizes the persisted payment even if issuance failed and does not match another payment', () => {
    const subscription = DASHBOARD_SNAPSHOT.subscriptions[0];
    const snapshot = {
      ...DASHBOARD_SNAPSHOT,
      subscriptions: [{ ...subscription, saga: { ...subscription.saga, status: 'fallida' } }],
    };
    expect(quoteProgress('request-001', snapshot, now).action).toBe('viewSubscription');
    expect(quoteProgress('another-request', snapshot, now).action).toBe('viewOffers');
  });
});

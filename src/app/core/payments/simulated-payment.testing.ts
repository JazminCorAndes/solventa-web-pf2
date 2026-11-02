import { SelectedOfferRecord } from '../offers/offer.models';
import { SubscriptionRecord } from '../subscriptions/subscription.models';
import {
  ConfirmedSimulatedPayment,
  PendingSimulatedPayment,
  RejectedSimulatedPayment,
} from './simulated-payment.models';

export const PAYMENT_OWNER_ID = 'payment-test-client';
export const PAYMENT_ATTEMPT_KEY = '50000000-0000-4000-8000-000000000001';

export const PAYMENT_SELECTION: SelectedOfferRecord = {
  quoteId: 'AQT-2026-ABCDEF1234',
  offerId: '20000000-0000-4000-8000-000000000001',
  offerVersion: 1,
  offerName: 'Seguro por vuelo',
  premium: { amount: 12345.67, currency: 'COP' },
  periodicity: 'por_vuelo',
  selectedAt: '2026-10-16T15:00:00Z',
  confirmed: true,
};

export const PAYMENT_SUBSCRIPTION: SubscriptionRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  quoteId: PAYMENT_SELECTION.quoteId,
  offerId: PAYMENT_SELECTION.offerId,
  offerVersion: PAYMENT_SELECTION.offerVersion,
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
  saga: { status: 'payment_pending', version: 1, updatedAt: '2026-10-16T15:00:00Z' },
};

export const CONFIRMED_PAYMENT: ConfirmedSimulatedPayment = {
  id: '40000000-0000-4000-8000-000000000001',
  quoteId: PAYMENT_SELECTION.quoteId,
  subscriptionId: PAYMENT_SUBSCRIPTION.id,
  offerId: PAYMENT_SELECTION.offerId,
  offerVersion: PAYMENT_SELECTION.offerVersion,
  status: 'confirmed',
  simulated: true,
  reference: 'SIM-40000000-0000-4000-8000-000000000001',
  premium: PAYMENT_SELECTION.premium,
  periodicity: PAYMENT_SELECTION.periodicity,
  confirmedAt: '2026-10-16T15:01:00Z',
  saga: { status: 'payment_confirmed', version: 2, updatedAt: '2026-10-16T15:01:00Z' },
};

export const REJECTED_PAYMENT: RejectedSimulatedPayment = {
  id: '40000000-0000-4000-8000-000000000002',
  quoteId: PAYMENT_SELECTION.quoteId,
  subscriptionId: PAYMENT_SUBSCRIPTION.id,
  offerId: PAYMENT_SELECTION.offerId,
  offerVersion: PAYMENT_SELECTION.offerVersion,
  status: 'rejected',
  simulated: true,
  reference: 'SIM-40000000-0000-4000-8000-000000000002',
  premium: PAYMENT_SELECTION.premium,
  periodicity: PAYMENT_SELECTION.periodicity,
  rejectedAt: '2026-10-16T15:01:00Z',
  reason: 'rechazo_simulado',
  saga: { ...PAYMENT_SUBSCRIPTION.saga, status: 'payment_pending' },
};

export const REJECTED_PAYMENT_RESPONSE = {
  id: REJECTED_PAYMENT.id,
  solicitudId: REJECTED_PAYMENT.quoteId,
  suscripcionId: REJECTED_PAYMENT.subscriptionId,
  ofertaId: REJECTED_PAYMENT.offerId,
  ofertaVersion: REJECTED_PAYMENT.offerVersion,
  estado: 'rechazado',
  simulada: true,
  referenciaInterna: REJECTED_PAYMENT.reference,
  importe: { monto: '12345.67', moneda: 'COP' },
  periodicidad: REJECTED_PAYMENT.periodicity,
  rechazadaEn: REJECTED_PAYMENT.rejectedAt,
  motivo: 'rechazo_simulado',
  saga: { estado: 'pago_pendiente', version: 1, actualizadaEn: REJECTED_PAYMENT.saga.updatedAt },
};

export const PENDING_PAYMENT: PendingSimulatedPayment = {
  id: CONFIRMED_PAYMENT.id,
  quoteId: PAYMENT_SELECTION.quoteId,
  subscriptionId: PAYMENT_SUBSCRIPTION.id,
  offerId: PAYMENT_SELECTION.offerId,
  offerVersion: PAYMENT_SELECTION.offerVersion,
  status: 'pending',
  simulated: true,
  reference: CONFIRMED_PAYMENT.reference,
  premium: PAYMENT_SELECTION.premium,
  periodicity: PAYMENT_SELECTION.periodicity,
  createdAt: '2026-10-16T15:00:30Z',
  code: 'resultado_no_confirmado',
  saga: { ...PAYMENT_SUBSCRIPTION.saga, status: 'payment_pending' },
};

export const PENDING_PAYMENT_RESPONSE = {
  id: PENDING_PAYMENT.id,
  solicitudId: PENDING_PAYMENT.quoteId,
  suscripcionId: PENDING_PAYMENT.subscriptionId,
  ofertaId: PENDING_PAYMENT.offerId,
  ofertaVersion: PENDING_PAYMENT.offerVersion,
  estado: 'pendiente',
  simulada: true,
  referenciaInterna: PENDING_PAYMENT.reference,
  importe: { monto: '12345.67', moneda: 'COP' },
  periodicidad: PENDING_PAYMENT.periodicity,
  creadaEn: PENDING_PAYMENT.createdAt,
  codigo: PENDING_PAYMENT.code,
  saga: { estado: 'pago_pendiente', version: 1, actualizadaEn: PENDING_PAYMENT.saga.updatedAt },
};

export function storeUnresolvedPaymentAttempt(key = PAYMENT_ATTEMPT_KEY): void {
  window.sessionStorage.setItem(
    `solventa.payment.receipt.${PAYMENT_SUBSCRIPTION.id}`,
    JSON.stringify({
      key,
      outcome: 'unresolved',
      ownerId: PAYMENT_OWNER_ID,
      quoteId: PAYMENT_SUBSCRIPTION.quoteId,
      subscriptionId: PAYMENT_SUBSCRIPTION.id,
    }),
  );
  window.sessionStorage.setItem(`solventa.payment.attempt.${PAYMENT_SUBSCRIPTION.id}`, key);
}

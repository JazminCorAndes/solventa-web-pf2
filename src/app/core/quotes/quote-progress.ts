import { DashboardSnapshot } from '../dashboard/dashboard.models';

export function quoteProgress(requestId: string, snapshot: DashboardSnapshot, now = Date.now()) {
  const quote = snapshot.quotes.find((item) => item.requestId === requestId);
  const subscription = snapshot.subscriptions.find((item) => item.requestId === requestId);
  const paid =
    !!subscription &&
    (['pago_confirmado', 'emitida'].includes(subscription.saga.status) ||
      snapshot.payments.some(
        (payment) => payment.requestId === requestId && payment.subscriptionId === subscription.id,
      ));
  const expired = paid && !!subscription?.validUntil && Date.parse(subscription.validUntil) <= now;
  return {
    status: paid ? (expired ? 'expired' : 'active') : 'inProgress',
    action: paid
      ? 'viewSubscription'
      : subscription?.status === 'aprobada' && subscription.saga.status === 'pago_pendiente'
        ? 'proceedToPayment'
        : subscription
          ? 'viewStatus'
          : quote?.selection
            ? 'continueAcceptance'
            : 'viewOffers',
    path: paid
      ? '/app/cotizaciones/suscripcion/detalle'
      : subscription
        ? '/app/cotizaciones/suscripcion'
        : quote?.selection
          ? '/app/cotizaciones/aceptacion'
          : '/app/cotizaciones/ofertas',
  };
}

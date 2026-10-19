import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DashboardGateway } from '../../core/dashboard/dashboard.gateway';
import {
  DashboardMoney,
  DashboardPayment,
  DashboardPolicy,
  DashboardQuote,
  DashboardSnapshot,
  DashboardSubscription,
} from '../../core/dashboard/dashboard.models';
import { isPremiumPeriodicity, PremiumPeriodicity } from '../../core/offers/offer.models';

@Injectable()
export class HttpDashboardGateway implements DashboardGateway {
  private readonly http = inject(HttpClient);

  load(): Observable<DashboardSnapshot> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/v1/clientes/me/dashboard`)
      .pipe(map(toSnapshot));
  }
}

function invalid(): never {
  throw new Error('The dashboard response is invalid.');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : invalid();
}

function date(value: unknown): string {
  const result = text(value);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) &&
    Number.isFinite(Date.parse(result))
    ? result
    : invalid();
}

function money(value: unknown, positive = false): DashboardMoney {
  const item = record(value);
  const amount = text(item['monto']);
  const currency = text(item['moneda']);
  if (
    !/^\d+\.\d{2}$/.test(amount) ||
    (positive && !/[1-9]/.test(amount)) ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    invalid();
  }
  return { amount, currency };
}

function periodicity(value: unknown): PremiumPeriodicity {
  return isPremiumPeriodicity(value) ? value : invalid();
}

function items<T>(value: unknown, convert: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) {
    invalid();
  }
  return value.map(convert);
}

function unavailable(value: unknown): { availability: 'no_implementado' } {
  if (record(value)['disponibilidad'] !== 'no_implementado') {
    invalid();
  }
  return { availability: 'no_implementado' };
}

function quote(value: unknown): DashboardQuote {
  const item = record(value);
  const selected = item['seleccion'] === null ? null : record(item['seleccion']);
  return {
    id: text(item['id']),
    requestId: item['solicitudId'] === null ? null : text(item['solicitudId']),
    productId: text(item['productoId']),
    status: text(item['estado']),
    createdAt: date(item['creadaEn']),
    validUntil: date(item['validaHasta']),
    estimatedPremium: money(item['primaEstimada']),
    selection: selected
      ? {
          offerId: text(selected['ofertaId']),
          offerName: text(selected['nombreOferta']),
          premium: money(selected['prima']),
          periodicity: periodicity(selected['periodicidad']),
          selectedAt: date(selected['seleccionadaEn']),
        }
      : null,
  };
}

function subscription(value: unknown): DashboardSubscription {
  const item = record(value);
  const saga = record(item['saga']);
  const version = saga['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    invalid();
  }
  return {
    id: text(item['id']),
    requestId: text(item['solicitudId']),
    quoteId: text(item['cotizacionId']),
    offerId: text(item['ofertaId']),
    status: text(item['estado']),
    createdAt: date(item['creadaEn']),
    updatedAt: date(item['actualizadaEn']),
    saga: {
      status: text(saga['estado']),
      version,
      updatedAt: date(saga['actualizadaEn']),
    },
  };
}

function payment(value: unknown): DashboardPayment {
  const item = record(value);
  if (item['estado'] !== 'confirmado' || item['simulada'] !== true) {
    invalid();
  }
  return {
    id: text(item['id']),
    requestId: text(item['solicitudId']),
    subscriptionId: text(item['suscripcionId']),
    status: 'confirmado',
    simulated: true,
    amount: money(item['importe'], true),
    periodicity: periodicity(item['periodicidad']),
    confirmedAt: date(item['confirmadaEn']),
  };
}

function coverageDate(value: unknown): string {
  const result = text(value);
  const parsed = new Date(`${result}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === result
    ? result
    : invalid();
}

function policy(value: unknown): DashboardPolicy {
  const item = record(value);
  const startDate = coverageDate(item['fechaInicio']);
  const endDate = coverageDate(item['fechaFin']);
  if (endDate < startDate || item['simulada'] !== true) {
    invalid();
  }
  return {
    id: text(item['id']),
    subscriptionId: text(item['suscripcionId']),
    type: text(item['tipo']),
    startDate,
    endDate,
    status: text(item['estado']),
    simulated: true,
  };
}

function toSnapshot(value: unknown): DashboardSnapshot {
  const item = record(value);
  return {
    quotes: items(item['cotizaciones'], quote),
    subscriptions: items(item['suscripciones'], subscription),
    payments: items(item['pagos'], payment),
    policies: items(item['polizas'], policy),
    notifications: unavailable(item['notificaciones']),
  };
}

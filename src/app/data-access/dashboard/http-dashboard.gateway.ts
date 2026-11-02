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
  const fields = record(value);
  const amount = text(fields['monto']);
  const currency = text(fields['moneda']);
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
  const fields = record(value);
  const selected = fields['seleccion'] === null ? null : record(fields['seleccion']);
  return {
    id: text(fields['id']),
    requestId: fields['solicitudId'] === null ? null : text(fields['solicitudId']),
    productId: text(fields['productoId']),
    status: text(fields['estado']),
    createdAt: date(fields['creadaEn']),
    validUntil: date(fields['validaHasta']),
    estimatedPremium: money(fields['primaEstimada']),
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
  const fields = record(value);
  const saga = record(fields['saga']);
  const version = saga['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    invalid();
  }
  return {
    id: text(fields['id']),
    requestId: text(fields['solicitudId']),
    quoteId: text(fields['cotizacionId']),
    validFrom: fields['vigenteDesde'] == null ? null : date(fields['vigenteDesde']),
    validUntil: fields['vigenteHasta'] == null ? null : date(fields['vigenteHasta']),
    offerId: text(fields['ofertaId']),
    status: text(fields['estado']),
    createdAt: date(fields['creadaEn']),
    updatedAt: date(fields['actualizadaEn']),
    saga: {
      status: text(saga['estado']),
      version,
      updatedAt: date(saga['actualizadaEn']),
    },
  };
}

function payment(value: unknown): DashboardPayment {
  const fields = record(value);
  if (
    !['confirmado', 'rechazado'].includes(String(fields['estado'])) ||
    fields['simulada'] !== true
  ) {
    invalid();
  }
  const common = {
    id: text(fields['id']),
    requestId: text(fields['solicitudId']),
    subscriptionId: text(fields['suscripcionId']),
    amount: money(fields['importe'], true),
    periodicity: periodicity(fields['periodicidad']),
  };
  if (fields['estado'] === 'rechazado') {
    if (fields['motivo'] !== 'rechazo_simulado' || 'confirmadaEn' in fields) invalid();
    return {
      ...common,
      status: 'rechazado',
      simulated: true,
      rejectedAt: date(fields['rechazadaEn']),
      reason: 'rechazo_simulado',
    };
  }
  return {
    ...common,
    status: 'confirmado',
    simulated: true,
    confirmedAt: date(fields['confirmadaEn']),
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
  const fields = record(value);
  const startDate = coverageDate(fields['fechaInicio']);
  const endDate = coverageDate(fields['fechaFin']);
  if (endDate < startDate || fields['simulada'] !== true) {
    invalid();
  }
  return {
    id: text(fields['id']),
    subscriptionId: text(fields['suscripcionId']),
    type: text(fields['tipo']),
    startDate,
    endDate,
    status: text(fields['estado']),
    simulated: true,
  };
}

function toSnapshot(value: unknown): DashboardSnapshot {
  const fields = record(value);
  return {
    quotes: items(fields['cotizaciones'], quote),
    subscriptions: items(fields['suscripciones'], subscription),
    payments: items(fields['pagos'], payment),
    policies: items(fields['polizas'], policy),
    notifications: unavailable(fields['notificaciones']),
  };
}

import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isPremiumPeriodicity } from '../../core/offers/offer.models';
import { SimulatedPaymentGateway } from '../../core/payments/simulated-payment.gateway';
import { SimulatedPaymentRecord } from '../../core/payments/simulated-payment.models';

interface PaymentResponse {
  id: string;
  solicitudId: string;
  suscripcionId: string;
  ofertaId: string;
  ofertaVersion: number;
  estado: 'confirmado';
  simulada: true;
  referenciaInterna: string;
  importe: { monto: string; moneda: string };
  periodicidad: string;
  confirmadaEn: string;
  saga: { estado: 'pago_confirmado'; version: number; actualizadaEn: string };
}

@Injectable()
export class HttpSimulatedPaymentGateway implements SimulatedPaymentGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion`;

  load(quoteId: string): Observable<SimulatedPaymentRecord | null> {
    return this.http.get<PaymentResponse>(this.url(quoteId)).pipe(
      map(toPayment),
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 404 &&
          error.error?.code === 'pago_no_encontrado'
        ) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  confirm(quoteId: string, idempotencyKey: string): Observable<SimulatedPaymentRecord> {
    return this.http
      .post<PaymentResponse>(
        this.url(quoteId),
        {},
        {
          headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
        },
      )
      .pipe(map(toPayment));
  }

  private url(quoteId: string): string {
    return `${this.apiUrl}/${encodeURIComponent(quoteId)}/pago-simulado`;
  }
}

function toPayment(response: PaymentResponse): SimulatedPaymentRecord {
  const amount = response?.importe?.monto;
  const currency = response?.importe?.moneda;
  if (
    response?.estado !== 'confirmado' ||
    response.simulada !== true ||
    typeof response.id !== 'string' ||
    !response.id ||
    typeof response.solicitudId !== 'string' ||
    !response.solicitudId ||
    typeof response.suscripcionId !== 'string' ||
    !response.suscripcionId ||
    typeof response.ofertaId !== 'string' ||
    !response.ofertaId ||
    !Number.isInteger(response.ofertaVersion) ||
    response.ofertaVersion < 1 ||
    response.referenciaInterna !== `SIM-${response.id}` ||
    !isPremiumPeriodicity(response.periodicidad) ||
    typeof amount !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(amount) ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0 ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency) ||
    typeof response.confirmadaEn !== 'string' ||
    !Number.isFinite(Date.parse(response.confirmadaEn)) ||
    response.saga?.estado !== 'pago_confirmado' ||
    !Number.isInteger(response.saga.version) ||
    response.saga.version < 2 ||
    typeof response.saga.actualizadaEn !== 'string' ||
    !Number.isFinite(Date.parse(response.saga.actualizadaEn))
  ) {
    throw new Error('The simulated payment response is invalid.');
  }
  return {
    id: response.id,
    quoteId: response.solicitudId,
    subscriptionId: response.suscripcionId,
    offerId: response.ofertaId,
    offerVersion: response.ofertaVersion,
    status: 'confirmed',
    simulated: true,
    reference: response.referenciaInterna,
    premium: { amount: Number(amount), currency },
    periodicity: response.periodicidad,
    confirmedAt: response.confirmadaEn,
    saga: {
      status: 'payment_confirmed',
      version: response.saga.version,
      updatedAt: response.saga.actualizadaEn,
    },
  };
}

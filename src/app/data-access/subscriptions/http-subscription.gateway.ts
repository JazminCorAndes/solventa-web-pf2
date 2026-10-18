import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubscriptionGateway } from '../../core/subscriptions/subscription.gateway';
import {
  IssuanceSagaStatus,
  SubscriptionRecord,
  SubscriptionStatus,
} from '../../core/subscriptions/subscription.models';

interface SubscriptionResponse {
  id: string;
  solicitudId: string;
  ofertaId: string;
  ofertaVersion: number;
  estado: 'aprobada' | 'revision' | 'rechazada';
  reglaVersion: string;
  creadaEn: string;
  actualizadaEn: string;
  decision: {
    resultado: 'aprobada' | 'revision' | 'rechazada';
    reglaVersion: string;
    hashDecision: string;
    decididaEn: string;
  };
  saga: {
    estado: 'pago_pendiente' | 'pago_confirmado' | 'emitida' | 'fallida';
    version: number;
    actualizadaEn: string;
  };
}

@Injectable()
export class HttpSubscriptionGateway implements SubscriptionGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion`;

  start(quoteId: string): Observable<SubscriptionRecord> {
    return this.http
      .post<SubscriptionResponse>(
        `${this.apiUrl}/${quoteId}/suscripcion`,
        {},
        {
          headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
        },
      )
      .pipe(map(toSubscription));
  }

  load(quoteId: string): Observable<SubscriptionRecord | null> {
    return this.http.get<SubscriptionResponse>(`${this.apiUrl}/${quoteId}/suscripcion`).pipe(
      map(toSubscription),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }
}

function toSubscription(response: SubscriptionResponse): SubscriptionRecord {
  return {
    id: response.id,
    quoteId: response.solicitudId,
    offerId: response.ofertaId,
    offerVersion: response.ofertaVersion,
    status: toStatus(response.estado),
    ruleVersion: response.reglaVersion,
    createdAt: response.creadaEn,
    updatedAt: response.actualizadaEn,
    decision: {
      result: toStatus(response.decision.resultado),
      ruleVersion: response.decision.reglaVersion,
      decisionHash: response.decision.hashDecision,
      decidedAt: response.decision.decididaEn,
    },
    saga: {
      status: toSagaStatus(response.saga.estado),
      version: response.saga.version,
      updatedAt: response.saga.actualizadaEn,
    },
  };
}

function toStatus(status: SubscriptionResponse['estado']): SubscriptionStatus {
  switch (status) {
    case 'aprobada':
      return 'approved';
    case 'revision':
      return 'review';
    case 'rechazada':
      return 'rejected';
    default:
      throw new Error('The subscription contains an invalid decision status.');
  }
}

function toSagaStatus(status: SubscriptionResponse['saga']['estado']): IssuanceSagaStatus {
  switch (status) {
    case 'pago_pendiente':
      return 'payment_pending';
    case 'pago_confirmado':
      return 'payment_confirmed';
    case 'emitida':
      return 'issued';
    case 'fallida':
      return 'failed';
    default:
      throw new Error('The subscription contains an invalid saga status.');
  }
}

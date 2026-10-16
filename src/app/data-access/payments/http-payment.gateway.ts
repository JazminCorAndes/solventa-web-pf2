import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentGateway } from '../../core/payments/payment.gateway';
import { PaymentPolicyRecord } from '../../core/payments/payment.models';

interface PaymentPolicyResponse {
  pago: {
    id: string;
    estado: 'confirmado';
    monto: string;
    moneda: string;
    metodoPago: 'tarjeta';
    confirmadaEn: string;
    transaccion: {
      id: string;
      estado: 'confirmado';
      referencia: string;
      procesadaEn: string;
    };
  };
  poliza: {
    id: string;
    numero: string;
    estado: 'vigente';
    productoId: string;
    primaMensual: string;
    moneda: string;
    vigenteDesde: string;
    vigenteHasta: string;
    emitidaEn: string;
  };
  saga: {
    estado: 'emitida';
    version: number;
    actualizadaEn: string;
  };
}

@Injectable()
export class HttpPaymentGateway implements PaymentGateway {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion`;

  pay(quoteId: string): Observable<PaymentPolicyRecord> {
    return this.http
      .post<PaymentPolicyResponse>(
        `${this.apiUrl}/${quoteId}/pago`,
        { metodoPago: 'tarjeta' },
        { headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }) },
      )
      .pipe(map(toPaymentPolicy));
  }

  loadPolicy(quoteId: string): Observable<PaymentPolicyRecord | null> {
    return this.http.get<PaymentPolicyResponse>(`${this.apiUrl}/${quoteId}/poliza`).pipe(
      map(toPaymentPolicy),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }
}

function toPaymentPolicy(response: PaymentPolicyResponse): PaymentPolicyRecord {
  return {
    payment: {
      id: response.pago.id,
      status: 'confirmed',
      amount: Number(response.pago.monto),
      currency: response.pago.moneda,
      method: 'card',
      confirmedAt: response.pago.confirmadaEn,
      transactionId: response.pago.transaccion.id,
      reference: response.pago.transaccion.referencia,
    },
    policy: {
      id: response.poliza.id,
      number: response.poliza.numero,
      status: 'active',
      productId: response.poliza.productoId,
      monthlyPremium: Number(response.poliza.primaMensual),
      currency: response.poliza.moneda,
      validFrom: response.poliza.vigenteDesde,
      validUntil: response.poliza.vigenteHasta,
      issuedAt: response.poliza.emitidaEn,
    },
    saga: {
      status: 'issued',
      version: response.saga.version,
      updatedAt: response.saga.actualizadaEn,
    },
  };
}

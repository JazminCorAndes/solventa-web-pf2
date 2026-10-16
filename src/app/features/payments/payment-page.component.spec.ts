import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { PaymentPolicyRecord } from '../../core/payments/payment.models';
import { PaymentService } from '../../core/payments/payment.service';
import { PaymentPageComponent } from './payment-page.component';

const RESULT: PaymentPolicyRecord = {
  payment: {
    id: 'payment-1',
    status: 'confirmed',
    amount: 89700,
    currency: 'COP',
    method: 'card',
    confirmedAt: '2026-10-16T16:00:00Z',
    transactionId: 'transaction-1',
    reference: 'PAY-ABC123',
  },
  policy: {
    id: 'policy-1',
    number: 'SOL-202610-ABC123',
    status: 'active',
    productId: 'product-1',
    monthlyPremium: 89700,
    currency: 'COP',
    validFrom: '2026-10-16T16:00:00Z',
    validUntil: '2027-10-16T16:00:00Z',
    issuedAt: '2026-10-16T16:00:00Z',
  },
  saga: { status: 'issued', version: 3, updatedAt: '2026-10-16T16:00:00Z' },
};

describe('PaymentPageComponent', () => {
  let fixture: ComponentFixture<PaymentPageComponent>;
  const result = signal<PaymentPolicyRecord | null>(null);
  const pay = vi.fn(() => {
    result.set(RESULT);
    return of(RESULT);
  });

  beforeEach(async () => {
    result.set(null);
    pay.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        PaymentPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              payment: {
                eyebrow: '4 de 4 · Pago',
                title: 'Realiza el pago',
                subtitle: 'Confirma el método de pago.',
                plan: 'Plan seleccionado',
                methodTitle: 'Método de pago',
                card: 'Tarjeta débito o crédito',
                safe: 'Transacción segura',
                selected: 'Seleccionado',
                action: 'Confirmar pago',
                processing: 'Procesando pago',
                approved: 'Pago aprobado. Referencia:',
                viewPolicy: 'Ver póliza emitida',
                back: 'Volver',
                error: 'No fue posible confirmar el pago.',
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: OfferSelectionService,
          useValue: {
            confirmedSelection: signal({
              offerName: 'Plan Protección Total',
              monthlyPremium: { amount: 89700, currency: 'COP' },
            }),
          },
        },
        {
          provide: PaymentService,
          useValue: { result, loading: signal(false), error: signal(false), pay },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PaymentPageComponent);
    fixture.detectChanges();
  });

  it('confirms payment once and enables the issued policy', () => {
    fixture.componentInstance.pay();
    fixture.detectChanges();

    expect(pay).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('PAY-ABC123');
    expect(fixture.nativeElement.textContent).toContain('Ver póliza emitida');
  });
});

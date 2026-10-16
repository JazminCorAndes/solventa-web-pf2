import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PaymentService } from '../../core/payments/payment.service';
import { PolicyIssuedPageComponent } from './policy-issued-page.component';
import { PaymentPolicyRecord } from '../../core/payments/payment.models';

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

describe('PolicyIssuedPageComponent', () => {
  let fixture: ComponentFixture<PolicyIssuedPageComponent>;
  const loadPolicy = vi.fn();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PolicyIssuedPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              policy: {
                eyebrow: 'Protección activa',
                title: 'Tu póliza fue emitida',
                subtitle: 'La póliza ya está vigente.',
                number: 'Número de póliza',
                active: 'Vigente',
                premium: 'Prima mensual',
                validFrom: 'Inicio de vigencia',
                validUntil: 'Fin de vigencia',
                paymentReference: 'Referencia de pago',
                dashboard: 'Volver al inicio',
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: PaymentService,
          useValue: { result: signal(RESULT), loadPolicy },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyIssuedPageComponent);
    fixture.detectChanges();
  });

  it('shows the persistent policy and payment reference', () => {
    const text = fixture.nativeElement.textContent;

    expect(loadPolicy).toHaveBeenCalled();
    expect(text).toContain('Tu póliza fue emitida');
    expect(text).toContain('SOL-202610-ABC123');
    expect(text).toContain('PAY-ABC123');
  });
});

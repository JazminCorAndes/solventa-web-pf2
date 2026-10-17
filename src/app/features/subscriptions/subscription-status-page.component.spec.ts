import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { SubscriptionRecord } from '../../core/subscriptions/subscription.models';
import { SubscriptionService } from '../../core/subscriptions/subscription.service';
import { SubscriptionStatusPageComponent } from './subscription-status-page.component';

const SUBSCRIPTION: SubscriptionRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  quoteId: 'AQT-2026-ABCDEF1234',
  offerId: '20000000-0000-4000-8000-000000000001',
  offerVersion: 1,
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
  saga: {
    status: 'payment_pending',
    version: 1,
    updatedAt: '2026-10-16T15:00:00Z',
  },
};

describe('SubscriptionStatusPageComponent', () => {
  let fixture: ComponentFixture<SubscriptionStatusPageComponent>;
  const load = vi.fn();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        SubscriptionStatusPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              subscription: {
                eyebrow: 'Suscripción',
                title: 'Suscripción aprobada',
                subtitle: 'La oferta cumple las condiciones y el pago está habilitado.',
                operation: 'Identificador de operación',
                offer: 'Oferta aceptada',
                decision: 'Decisión',
                approved: 'Aprobada',
                rule: 'Regla aplicada',
                next: 'El siguiente paso es registrar el pago para emitir la póliza.',
                back: 'Volver a la aceptación',
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: SubscriptionService,
          useValue: { subscription: signal(SUBSCRIPTION), load },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionStatusPageComponent);
    fixture.detectChanges();
  });

  it('shows the approved decision and operation identifier', () => {
    const text = fixture.nativeElement.textContent;

    expect(load).toHaveBeenCalled();
    expect(text).toContain('Suscripción aprobada');
    expect(text).toContain(SUBSCRIPTION.id);
    expect(text).toContain('Aprobada');
  });
});

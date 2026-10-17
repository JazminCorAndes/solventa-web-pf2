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
  const subscription = signal<SubscriptionRecord | null>(SUBSCRIPTION);
  const loading = signal(false);
  const error = signal(false);

  beforeEach(async () => {
    load.mockClear();
    subscription.set(SUBSCRIPTION);
    loading.set(false);
    error.set(false);
    await TestBed.configureTestingModule({
      imports: [
        SubscriptionStatusPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              subscription: {
                eyebrow: 'Suscripción',
                title: 'Estado de suscripción',
                subtitle: 'Estado informado por el servicio.',
                operation: 'Identificador de operación',
                offer: 'Oferta aceptada',
                decision: 'Decisión',
                statuses: { approved: 'Aprobada', review: 'En revisión', rejected: 'Rechazada' },
                saga: 'Estado de emisión',
                sagaStatuses: {
                  payment_pending: 'Pago pendiente',
                  payment_confirmed: 'Pago confirmado',
                  issued: 'Póliza emitida',
                  failed: 'Emisión fallida',
                },
                loading: 'Consultando la suscripción',
                error: 'No fue posible consultar la suscripción.',
                empty: 'No hay una suscripción registrada.',
                rule: 'Regla aplicada',
                next: 'El registro de pagos aún no está disponible.',
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
          useValue: { subscription, loading, error, load },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionStatusPageComponent);
    fixture.detectChanges();
  });

  it('shows the approved decision and operation identifier', () => {
    const text = fixture.nativeElement.textContent;

    expect(load).toHaveBeenCalled();
    expect(text).toContain('Estado de suscripción');
    expect(text).toContain(SUBSCRIPTION.id);
    expect(text).toContain('Aprobada');
    expect(text).toContain('El registro de pagos aún no está disponible.');
    expect(fixture.nativeElement.querySelector('.success-icon')).not.toBeNull();
  });

  it.each([
    { status: 'review' as const, label: 'En revisión' },
    { status: 'rejected' as const, label: 'Rechazada' },
  ])('shows $status without approval or payment instructions', ({ status, label }) => {
    subscription.set({
      ...SUBSCRIPTION,
      status,
      decision: { ...SUBSCRIPTION.decision, result: status },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.textContent).not.toContain('Aprobada');
    expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
    expect(fixture.nativeElement.querySelector('.next-step')).toBeNull();
  });

  it.each([
    { status: 'payment_confirmed' as const, label: 'Pago confirmado' },
    { status: 'issued' as const, label: 'Póliza emitida' },
    { status: 'failed' as const, label: 'Emisión fallida' },
  ])('shows saga $status without requesting payment', ({ status, label }) => {
    subscription.set({ ...SUBSCRIPTION, saga: { ...SUBSCRIPTION.saga, status } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('.next-step')).toBeNull();
    if (status === 'failed') {
      expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
    }
  });

  it('hides cached success while loading', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Consultando la suscripción');
    expect(fixture.nativeElement.textContent).not.toContain(SUBSCRIPTION.id);
  });

  it('shows a retry instead of cached success after failure', () => {
    error.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(SUBSCRIPTION.id);
    fixture.nativeElement.querySelector('button').click();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows a missing subscription without success', () => {
    subscription.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay una suscripción registrada.');
    expect(fixture.nativeElement.querySelector('.success-icon')).toBeNull();
  });
});

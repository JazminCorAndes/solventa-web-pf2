import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import {
  MortgageProfilingError,
  MortgageProfilingRecord,
} from '../../core/advisor-profiling/advisor-profiling.models';
import { AdvisorProfilingService } from '../../core/advisor-profiling/advisor-profiling.service';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { MortgageProfilingStartPageComponent } from './mortgage-profiling-start-page.component';

describe('MortgageProfilingStartPageComponent', () => {
  let fixture: ComponentFixture<MortgageProfilingStartPageComponent>;
  let component: MortgageProfilingStartPageComponent;
  let response: Observable<MortgageProfilingRecord>;
  const start = vi.fn<AdvisorProfilingService['start']>(() => response);
  const reset = vi.fn();
  const pendingOperation = signal(null);
  const user = signal<AuthUser | null>(null);
  const getAccessToken = vi.fn(() => of<string | null>('test-access'));
  const completed: MortgageProfilingRecord = {
    operationId: '11111111-1111-4111-8111-111111111111',
    partnerId: 'BANCO-001',
    customerId: '44444444-4444-4444-8444-444444444444',
    productId: 'mortgage-life',
    profilingReference: 'PRF-HIP-001',
    quoteRequestId: 'AQT-2026-ABC123',
    quoteId: '33333333-3333-4333-8333-333333333333',
    status: 'completed',
    receivedAt: '2026-10-20T12:00:00Z',
  };
  const advisor: AuthUser = {
    id: 'advisor-test',
    name: 'Asesor de prueba',
    email: 'asesor@example.com',
    role: 'advisor',
    partnerIds: ['BANCO-001'],
  };
  const validValue = {
    customerId: completed.customerId,
    documentType: 'cc' as const,
    documentNumber: '1023456789',
    birthDate: '1985-02-10',
    phone: '+573001234567',
    creditReference: 'HIP-001',
    creditAmount: 310_000_000,
    termMonths: 240,
    consentId: '11111111-1111-4111-8111-111111111111',
    consentVersion: 1,
    consentVerified: true,
  };

  beforeEach(async () => {
    response = of(completed);
    user.set(advisor);
    getAccessToken.mockReset().mockReturnValue(of('test-access'));
    start.mockClear();
    reset.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        MortgageProfilingStartPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        { provide: AdvisorProfilingService, useValue: { start, reset, pendingOperation } },
        { provide: AuthService, useValue: { user, getAccessToken } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MortgageProfilingStartPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('no envía datos incompletos ni consentimiento sin verificar', () => {
    component.submit();
    fixture.detectChanges();

    expect(start).not.toHaveBeenCalled();
    expect(component.form.controls.consentVerified.hasError('required')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('mat-error').length,
    ).toBeGreaterThan(0);
  });

  it('bloquea envíos repetidos mientras espera la confirmación', () => {
    const pending = new Subject<MortgageProfilingRecord>();
    response = pending;
    component.form.setValue(validValue);

    component.submit();
    component.submit();

    expect(start).toHaveBeenCalledTimes(1);
    expect(component.processing()).toBe(true);
    pending.next(completed);
    pending.complete();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('PRF-HIP-001');
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain(completed.operationId);
    expect(text).toContain(completed.quoteRequestId);
    expect(text).toContain(completed.quoteId);
    expect(text).toContain(es.mortgageProfiling.status.completed);
    expect(text).toContain(es.mortgageProfiling.resultBody);
    expect(start.mock.calls[0][0]).toMatchObject({
      partnerId: 'BANCO-001',
      customer: { id: completed.customerId, birthDate: '1985-02-10' },
    });
  });

  it('muestra un error identificable y permite reintentar sin marcar éxito', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    response = throwError(() => new MortgageProfilingError('service_unavailable'));
    component.form.setValue(validValue);

    component.submit();
    fixture.detectChanges();

    expect(component.result()).toBeNull();
    expect(component.errorCode()).toBe('service_unavailable');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      es.mortgageProfiling.errors.service_unavailable,
    );
    expect(component.form.enabled).toBe(true);
  });

  it('muestra el socio autorizado único sin identidad ficticia', () => {
    expect(component.partnerId()).toBe('BANCO-001');
    expect(fixture.nativeElement.textContent).toContain('BANCO-001');
    expect(fixture.nativeElement.textContent).not.toContain('SOC-CO-001');
  });

  it('requiere selección explícita con varios socios y rechaza un socio ajeno', () => {
    fixture.destroy();
    user.set({ ...advisor, partnerIds: ['BANCO-001', 'BANCO-002'] });
    fixture = TestBed.createComponent(MortgageProfilingStartPageComponent);
    component = fixture.componentInstance;
    component.form.setValue(validValue);
    fixture.detectChanges();
    component.selectPartner('OTRO-SOCIO');
    component.submit();
    expect(component.partnerId()).toBeNull();
    expect(start).not.toHaveBeenCalled();
    component.selectPartner('BANCO-002');
    component.submit();
    expect(start.mock.calls[0][0]).toMatchObject({ partnerId: 'BANCO-002' });
  });

  it.each([
    null,
    { ...advisor, role: 'client' as const },
    { ...advisor, role: 'partner' as const },
    { ...advisor, partnerIds: [] },
    { ...advisor, partnerIds: undefined },
    { ...advisor, partnerIds: [''] },
    { ...advisor, partnerIds: ['BANCO-001', 'BANCO-001'] },
  ])('bloquea el formulario y el envío sin contexto asesor válido %#', (current) => {
    user.set(current);
    component.form.setValue(validValue);
    fixture.detectChanges();
    component.submit();
    expect(start).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(component.result()).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      es.mortgageProfiling.errors.advisor_context_unavailable,
    );
  });

  it.each(['role', 'membership', 'identity', 'token'])(
    'vuelve a comprobar el contexto tras renovar, sin enviar si cambia %s',
    (change) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      component.form.setValue(validValue);
      getAccessToken.mockImplementationOnce(() => {
        if (change === 'role') user.set({ ...advisor, role: 'client' });
        if (change === 'membership') user.set({ ...advisor, partnerIds: [] });
        if (change === 'identity') user.set({ ...advisor, id: 'otro-asesor' });
        return of(change === 'token' ? null : 'renewed-access');
      });
      component.submit();
      expect(start).not.toHaveBeenCalled();
      expect(component.result()).toBeNull();
      expect(component.errorCode()).toBe('unauthorized_partner');
    },
  );

  it('rechaza fracciones en crédito, plazo y versión de consentimiento', () => {
    component.form.setValue({
      ...validValue,
      creditAmount: 310000000.5,
      termMonths: 240.5,
      consentVersion: 1.5,
    });
    component.submit();
    expect(start).not.toHaveBeenCalled();
    expect(component.form.controls.creditAmount.hasError('pattern')).toBe(true);
    expect(component.form.controls.termMonths.hasError('pattern')).toBe(true);
    expect(component.form.controls.consentVersion.hasError('pattern')).toBe(true);
  });

  it('no muestra un recibo tardío si cambia el actor durante el POST', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pending = new Subject<MortgageProfilingRecord>();
    response = pending;
    component.form.setValue(validValue);
    component.submit();
    user.set({ ...advisor, id: 'otro-asesor' });
    fixture.detectChanges();
    pending.next(completed);
    pending.complete();
    fixture.detectChanges();
    expect(component.result()).toBeNull();
    expect(component.form.controls.customerId.value).toBe('');
    expect(component.form.controls.consentVerified.value).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain(completed.quoteRequestId);
  });

  it.each(['actor', 'partner', 'role'])(
    'oculta el resultado si pierde contexto por %s',
    (change) => {
      component.form.setValue(validValue);
      component.submit();
      expect(component.result()).toEqual(completed);
      user.set({
        ...advisor,
        id: change === 'actor' ? 'otro-asesor' : advisor.id,
        partnerIds: change === 'partner' ? ['OTRO-SOCIO'] : advisor.partnerIds,
        role: change === 'role' ? 'client' : 'advisor',
      });
      component.submit();
      fixture.detectChanges();
      expect(component.result()).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain(completed.quoteRequestId);
      expect(component.form.controls.customerId.value).toBe('');
      expect(component.form.controls.documentNumber.value).toBe('');
      expect(component.form.controls.birthDate.value).toBe('');
      expect(component.form.controls.phone.value).toBe('');
      expect(component.form.controls.creditReference.value).toBe('');
      expect(component.form.controls.creditAmount.value).toBeNull();
      expect(component.form.controls.consentId.value).toBe('');
      expect(component.form.controls.consentVerified.value).toBe(false);
      expect(component.form.enabled).toBe(true);
      component.submit();
      expect(start).toHaveBeenCalledTimes(1);
    },
  );

  it('el finalize de la petición vieja no habilita ni altera una nueva tras cambiar actor', () => {
    const previous = new Subject<MortgageProfilingRecord>();
    const current = new Subject<MortgageProfilingRecord>();
    response = previous;
    component.form.setValue(validValue);
    component.submit();
    user.set({ ...advisor, id: 'otro-asesor' });
    fixture.detectChanges();
    expect(component.processing()).toBe(false);
    expect(component.form.controls.consentVerified.value).toBe(false);
    response = current;
    component.form.setValue(validValue);
    component.submit();
    expect(start).toHaveBeenCalledTimes(2);
    expect(component.processing()).toBe(true);
    expect(component.form.disabled).toBe(true);
    previous.next(completed);
    previous.complete();
    expect(component.processing()).toBe(true);
    expect(component.form.disabled).toBe(true);
    current.next(completed);
    current.complete();
    expect(component.processing()).toBe(false);
    expect(component.result()).toEqual(completed);
  });

  it.each([false, true])(
    'conserva datos y socio al renovar el mismo asesor añadiendo socios (completado=%s)',
    (hasResult) => {
      component.form.setValue(validValue);
      if (hasResult) component.submit();
      user.set({ ...advisor, partnerIds: ['BANCO-001', 'BANCO-002'] });
      fixture.detectChanges();
      expect(component.partnerId()).toBe('BANCO-001');
      expect(component.form.getRawValue()).toEqual(validValue);
      expect(component.form.disabled).toBe(hasResult);
      expect(component.result()).toEqual(hasResult ? completed : null);
      expect(start).toHaveBeenCalledTimes(hasResult ? 1 : 0);
    },
  );
});

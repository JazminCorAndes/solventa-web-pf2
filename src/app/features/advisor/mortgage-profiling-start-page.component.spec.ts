import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import {
  MortgageProfilingError,
  MortgageProfilingRecord,
} from '../../core/advisor-profiling/advisor-profiling.models';
import { AdvisorProfilingService } from '../../core/advisor-profiling/advisor-profiling.service';
import { MortgageProfilingStartPageComponent } from './mortgage-profiling-start-page.component';

describe('MortgageProfilingStartPageComponent', () => {
  let fixture: ComponentFixture<MortgageProfilingStartPageComponent>;
  let component: MortgageProfilingStartPageComponent;
  let response: Observable<MortgageProfilingRecord>;
  const start = vi.fn(() => response);
  const reset = vi.fn();
  const validValue = {
    documentType: 'cc' as const,
    documentNumber: '1023456789',
    fullName: 'Valentina Gómez',
    email: 'valentina@example.com',
    phone: '+573001234567',
    creditReference: 'HIP-001',
    creditAmount: 310_000_000,
    termMonths: 240,
    consentId: '11111111-1111-4111-8111-111111111111',
    consentVersion: 1,
    consentVerified: true,
  };

  beforeEach(async () => {
    response = of({
      operationId: 'operation-001',
      profilingReference: 'PRF-HIP-001',
      status: 'processing',
      receivedAt: '2026-10-20T12:00:00Z',
    });
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
      providers: [{ provide: AdvisorProfilingService, useValue: { start, reset } }],
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
    pending.next({
      operationId: 'operation-001',
      profilingReference: 'PRF-HIP-001',
      status: 'processing',
      receivedAt: '2026-10-20T12:00:00Z',
    });
    pending.complete();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('PRF-HIP-001');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('operation-001');
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
});

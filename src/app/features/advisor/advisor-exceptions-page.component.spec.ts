import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import {
  ADVISOR_EXCEPTIONS_GATEWAY,
  AdvisorExceptionsGateway,
} from '../../core/advisor-exceptions/advisor-exceptions.gateway';
import {
  AdvisorException,
  AdvisorExceptionError,
  ResolvedAdvisorException,
} from '../../core/advisor-exceptions/advisor-exceptions.models';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AdvisorExceptionsPageComponent } from './advisor-exceptions-page.component';

describe('AdvisorExceptionsPageComponent', () => {
  let fixture: ComponentFixture<AdvisorExceptionsPageComponent>;
  let component: AdvisorExceptionsPageComponent;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let user: WritableSignal<AuthUser | null>;
  let gateway: {
    list: ReturnType<typeof vi.fn<AdvisorExceptionsGateway['list']>>;
    get: ReturnType<typeof vi.fn<AdvisorExceptionsGateway['get']>>;
    resolve: ReturnType<typeof vi.fn<AdvisorExceptionsGateway['resolve']>>;
  };
  const advisor: AuthUser = {
    id: 'advisor-123',
    name: 'Asesora de prueba',
    email: 'advisor@example.com',
    role: 'advisor',
    partnerIds: ['BANCO-001', 'BANCO-002'],
  };
  const exception: AdvisorException = {
    excepcionId: 'exception-123',
    operationId: 'operation-123',
    socioId: 'BANCO-001',
    clienteId: 'customer-123',
    codigo: 'fuente_no_disponible',
    motivoBloqueo: 'La fuente financiera no está disponible.',
    alcance: 'open_finance',
    finalidad: 'cotizacion',
    datos: ['indicador_riesgo'],
    consentimiento: {
      id: 'consent-123',
      version: 3,
      estado: 'autorizado',
      fuentes: ['fuente-a'],
      datos: ['indicador_riesgo'],
      finalidad: 'cotizacion',
      vigenteHasta: '2027-01-01T00:00:00Z',
    },
    estado: 'pendiente',
    estadoAnterior: 'bloqueada',
    creadoEn: '2026-10-20T12:00:00Z',
    correlationId: 'correlation-123',
    trazabilidad: {
      estadoAnterior: 'bloqueada',
      estadoActual: 'pendiente',
      alcance: 'open_finance',
      creadoEn: '2026-10-20T12:00:00Z',
      correlationId: 'correlation-123',
    },
  };
  const resolved: ResolvedAdvisorException = {
    ...exception,
    estado: 'aprobada',
    trazabilidad: { ...exception.trazabilidad, estadoActual: 'aprobada' },
    decision: 'aprobar',
    actorId: 'advisor-123',
    resueltaEn: '2026-10-21T12:00:00Z',
    motivo: 'Aprobación justificada.',
  };

  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({}));
    query = new BehaviorSubject(convertToParamMap({ socioId: 'BANCO-001' }));
    user = signal<AuthUser | null>(advisor);
    gateway = {
      list: vi.fn().mockReturnValue(of([])),
      get: vi.fn().mockReturnValue(of(exception)),
      resolve: vi.fn().mockReturnValue(of(resolved)),
    };
    await TestBed.configureTestingModule({
      imports: [
        AdvisorExceptionsPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        { provide: ADVISOR_EXCEPTIONS_GATEWAY, useValue: gateway },
        { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: query } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: AuthService, useValue: { user } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdvisorExceptionsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('carga una bandeja vacía solo para el socio seleccionado y muestra el estado vacío', () => {
    expect(gateway.list).toHaveBeenCalledWith('BANCO-001');
    expect(fixture.nativeElement.textContent).toContain(es.advisorExceptions.emptyTitle);
  });

  it('no consulta socios fuera de la membresía de la asesora', async () => {
    query.next(convertToParamMap({ socioId: 'OTRO-SOCIO' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.list).toHaveBeenCalledTimes(1);
    expect(component.selectedSocioId()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      es.advisorExceptions.errors.socio_no_autorizado,
    );
    component.selectSocio('OTRO-SOCIO');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

  it('carga detalle incluyendo motivoBloqueo y estadoAnterior', async () => {
    params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.get).toHaveBeenCalledWith(exception.excepcionId, 'BANCO-001');
    expect(fixture.nativeElement.textContent).toContain(exception.motivoBloqueo);
    expect(fixture.nativeElement.textContent).toContain(exception.estadoAnterior);
  });

  it('exige un motivo no vacío antes de resolver y acepta solo el resultado autoritativo', async () => {
    params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
    fixture.detectChanges();
    await fixture.whenStable();

    component.reasonForm.controls.motivo.setValue('   ');
    component.resolve('aprobar');
    expect(gateway.resolve).not.toHaveBeenCalled();
    expect(component.resolved()).toBeNull();

    component.reasonForm.controls.motivo.setValue(' Aprobación justificada. ');
    component.resolve('aprobar');
    fixture.detectChanges();
    expect(gateway.resolve).toHaveBeenCalledWith(
      exception.excepcionId,
      'BANCO-001',
      'aprobar',
      'Aprobación justificada.',
    );
    expect(component.resolved()).toEqual(resolved);
    expect(fixture.nativeElement.textContent).toContain(es.advisorExceptions.resolutionSaved);
    expect(fixture.nativeElement.textContent).toContain(resolved.actorId);
  });

  it('muestra la causa del consentimiento sin presentar éxito ante un rechazo del backend', async () => {
    gateway.resolve.mockReturnValue(
      throwError(() => new AdvisorExceptionError('consentimiento_no_vigente')),
    );
    params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
    fixture.detectChanges();
    await fixture.whenStable();

    component.reasonForm.controls.motivo.setValue('Aprobación justificada.');
    component.resolve('aprobar');
    fixture.detectChanges();

    expect(component.resolved()).toBeNull();
    expect(component.resolveErrorCode()).toBe('consentimiento_no_vigente');
    expect(fixture.nativeElement.textContent).toContain(
      es.advisorExceptions.errors.consentimiento_no_vigente,
    );
  });

  it.each([
    null,
    { ...advisor, role: 'client' as const },
    { ...advisor, role: 'partner' as const },
    { ...advisor, partnerIds: [] },
    { ...advisor, partnerIds: undefined },
  ])('bloquea la pantalla sin rol advisor y socios válidos %#', async (current) => {
    user.set(current);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('mat-card')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      es.advisorExceptions.errors.advisor_context_unavailable,
    );
  });
});

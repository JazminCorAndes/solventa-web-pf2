import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
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

  it.each(['usuario', 'socio', 'caso'] as const)(
    'WEB-F6 descarta el error tardío y el motivo al cambiar %s',
    async (contextChange) => {
      const response = new Subject<ResolvedAdvisorException>();
      gateway.get.mockImplementation((excepcionId, socioId) =>
        of({ ...exception, excepcionId, socioId }),
      );
      gateway.resolve.mockReturnValue(response.asObservable());
      params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
      fixture.detectChanges();
      await fixture.whenStable();

      component.reasonForm.controls.motivo.setValue('Motivo del caso anterior.');
      component.resolve('aprobar');
      expect(component.resolving()).toBe(true);

      if (contextChange === 'usuario') {
        user.set({ ...advisor, id: 'advisor-other' });
      } else if (contextChange === 'socio') {
        query.next(convertToParamMap({ socioId: 'BANCO-002' }));
      } else {
        params.next(convertToParamMap({ exceptionId: 'exception-other' }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      response.error(new AdvisorExceptionError('consentimiento_no_vigente'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.resolveErrorCode()).toBeNull();
      expect(component.reasonForm.controls.motivo.value).toBe('');
      expect(component.resolved()).toBeNull();
      expect(component.resolving()).toBe(false);
      expect(gateway.resolve).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.textContent).not.toContain(
        es.advisorExceptions.errors.consentimiento_no_vigente,
      );
    },
  );

  it('WEB-F6 revalida el detalle al cambiar de usuario aunque conserve el mismo socio', async () => {
    const previousRead = new Subject<AdvisorException>();
    gateway.get
      .mockReturnValueOnce(previousRead.asObservable())
      .mockReturnValueOnce(throwError(() => new AdvisorExceptionError('alcance_insuficiente')));
    params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
    fixture.detectChanges();
    await fixture.whenStable();

    user.set({ ...advisor, id: 'advisor-other' });
    fixture.detectChanges();
    await fixture.whenStable();
    previousRead.next(exception);
    previousRead.complete();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.get).toHaveBeenCalledTimes(2);
    expect(component.exception()).toBeNull();
    expect(component.loadErrorCode()).toBe('alcance_insuficiente');
    expect(fixture.nativeElement.textContent).not.toContain(exception.motivoBloqueo);
  });

  it('WEB-F6 conserva el motivo al reintentar la lectura del mismo caso y usuario', async () => {
    params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
    fixture.detectChanges();
    await fixture.whenStable();
    component.reasonForm.controls.motivo.setValue('Motivo del mismo caso.');

    component.retryLoad();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.get).toHaveBeenCalledTimes(2);
    expect(component.reasonForm.controls.motivo.value).toBe('Motivo del mismo caso.');
    expect(gateway.resolve).not.toHaveBeenCalled();
  });

  it.each(['bandeja', 'detalle'] as const)(
    'WEB-F6-CA recupera %s tras error de lectura sin mostrar vacío ni resolver',
    async (view) => {
      const listRead = new Subject<AdvisorException[]>();
      const detailRead = new Subject<AdvisorException>();
      if (view === 'bandeja') {
        gateway.list
          .mockReturnValueOnce(listRead.asObservable())
          .mockReturnValueOnce(of([exception]));
        component.retryLoad();
      } else {
        gateway.get
          .mockReturnValueOnce(detailRead.asObservable())
          .mockReturnValueOnce(of(exception));
        params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;

      expect(component.loading()).toBe(true);
      expect(root.querySelector('.loading-state')?.textContent).toContain(
        es.advisorExceptions.loading,
      );
      expect(root.querySelector('.empty-state')).toBeNull();
      expect(root.querySelector('[role=alert]')).toBeNull();

      const failure = new AdvisorExceptionError('servicio_no_disponible');
      if (view === 'bandeja') listRead.error(failure);
      else detailRead.error(failure);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.loading()).toBe(false);
      expect(root.querySelector('[role=alert]')?.textContent).toContain(
        es.advisorExceptions.errors.servicio_no_disponible,
      );
      expect(root.querySelector('.empty-state')).toBeNull();
      const retry = root.querySelector<HTMLButtonElement>('.inline-alert button');
      expect(retry?.textContent).toContain(es.advisorExceptions.retry);
      retry?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.loadErrorCode()).toBeNull();
      expect(root.querySelector('[role=alert]')).toBeNull();
      expect(root.querySelector('.exception-card')?.textContent).toContain(exception.motivoBloqueo);
      expect(root.querySelector('.empty-state')).toBeNull();
      if (view === 'bandeja') {
        expect(gateway.list).toHaveBeenCalledTimes(3);
        expect(gateway.get).not.toHaveBeenCalled();
        expect(component.exceptions()).toEqual([exception]);
      } else {
        expect(gateway.get).toHaveBeenCalledTimes(2);
        expect(component.exception()).toEqual(exception);
      }
      expect(gateway.resolve).not.toHaveBeenCalled();
      expect(component.resolved()).toBeNull();
    },
  );

  it.each([
    { decision: 'aprobar', estado: 'aprobada', buttonType: 'submit' },
    { decision: 'rechazar', estado: 'rechazada', buttonType: 'button' },
  ] as const)(
    'WEB-F6-CA exige motivo y espera la confirmación al $decision desde el formulario',
    async ({ decision, estado, buttonType }) => {
      const response = new Subject<ResolvedAdvisorException>();
      gateway.resolve.mockReturnValue(response.asObservable());
      params.next(convertToParamMap({ exceptionId: exception.excepcionId }));
      fixture.detectChanges();
      await fixture.whenStable();
      const root: HTMLElement = fixture.nativeElement;
      const button = root.querySelector<HTMLButtonElement>(`.actions button[type=${buttonType}]`);
      expect(button).not.toBeNull();
      component.reasonForm.controls.motivo.setValue('   ');
      button?.click();
      fixture.detectChanges();

      expect(gateway.resolve).not.toHaveBeenCalled();
      expect(component.resolved()).toBeNull();
      expect(root.textContent).toContain(es.advisorExceptions.validation.reason);

      const motivo = 'Decisión justificada para este caso.';
      component.reasonForm.controls.motivo.setValue(` ${motivo} `);
      button?.click();
      fixture.detectChanges();

      expect(gateway.resolve).toHaveBeenCalledExactlyOnceWith(
        exception.excepcionId,
        exception.socioId,
        decision,
        motivo,
      );
      expect(component.resolving()).toBe(true);
      expect(component.exception()?.estado).toBe('pendiente');
      expect(component.resolved()).toBeNull();
      expect(root.textContent).not.toContain(es.advisorExceptions.resolutionSaved);
      for (const action of root.querySelectorAll<HTMLButtonElement>('.actions button')) {
        expect(action.disabled).toBe(true);
        action.click();
      }
      expect(gateway.resolve).toHaveBeenCalledTimes(1);

      const receipt: ResolvedAdvisorException = {
        ...resolved,
        decision,
        estado,
        motivo,
        trazabilidad: { ...resolved.trazabilidad, estadoActual: estado },
      };
      response.next(receipt);
      response.complete();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.resolving()).toBe(false);
      expect(component.resolved()).toEqual(receipt);
      expect(component.exception()).toEqual(receipt);
      expect(root.querySelector('.resolution-card')).toBeNull();
      expect(root.querySelector('.success-alert')?.textContent).toContain(
        es.advisorExceptions.status[estado],
      );
      expect(root.querySelector('.success-alert')?.textContent).toContain(receipt.actorId);
      expect(root.querySelector('.success-alert')?.textContent).toContain(receipt.motivo);
      expect(gateway.resolve).toHaveBeenCalledTimes(1);
    },
  );

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

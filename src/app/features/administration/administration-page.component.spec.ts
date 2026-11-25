import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import {
  ADMINISTRATION_GATEWAY,
  AdministrationGateway,
} from '../../core/administration/administration.gateway';
import {
  AdministrativeClaim,
  ReviewDecision,
  ReviewHistory,
} from '../../core/administration/administration.models';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AdministrationPageComponent } from './administration-page.component';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER: AuthUser = {
  id: OTHER,
  name: 'Revisor',
  email: 'revisor@example.test',
  role: 'administrator',
};
const DETAIL: AdministrativeClaim = {
  siniestro: {
    id: ID,
    polizaId: OTHER,
    fechaEvento: '2026-11-25T10:00:00Z',
    tipoEvento: 'Incidente',
    descripcion: 'Descripción del incidente',
    lugar: 'Bogotá',
    estado: 'registrado',
    registradoEn: '2026-11-25T10:00:00Z',
  },
  evidencias: [],
};
const HISTORY: ReviewHistory = {
  siniestroId: ID,
  estado: 'en_revision',
  decisiones: [],
  asignacionActiva: {
    id: OTHER,
    siniestroId: ID,
    tipo: 'cola',
    destino: 'revision',
    estado: 'activa',
    asignadaEn: '2026-11-25T10:00:00Z',
    cerradaEn: null,
  },
};

describe('AdministrationPageComponent', () => {
  let fixture: ComponentFixture<AdministrationPageComponent>;
  let component: AdministrationPageComponent;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const user = signal<AuthUser | null>(USER);
  let gateway: {
    queue: ReturnType<typeof vi.fn<AdministrationGateway['queue']>>;
    claim: ReturnType<typeof vi.fn<AdministrationGateway['claim']>>;
    history: ReturnType<typeof vi.fn<AdministrationGateway['history']>>;
    decide: ReturnType<typeof vi.fn<AdministrationGateway['decide']>>;
    content: ReturnType<typeof vi.fn<AdministrationGateway['content']>>;
  };

  beforeEach(async () => {
    user.set(USER);
    params = new BehaviorSubject(convertToParamMap({ claimId: ID }));
    gateway = {
      queue: vi.fn().mockReturnValue(of([])),
      claim: vi.fn().mockReturnValue(of(DETAIL)),
      history: vi.fn().mockReturnValue(of(HISTORY)),
      decide: vi.fn().mockReturnValue(new Subject<ReviewDecision>()),
      content: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [
        AdministrationPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: AuthService, useValue: { user } },
        { provide: ADMINISTRATION_GATEWAY, useValue: gateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdministrationPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('usa el estado vigente, exige motivo y bloquea doble envío', () => {
    expect(component.canDecide()).toBe(true);
    component.form.controls.motivo.setValue(' corto ');
    component.submit();
    expect(gateway.decide).not.toHaveBeenCalled();
    component.form.controls.motivo.setValue('  Revisión documentada  ');
    component.submit();
    component.submit();
    expect(gateway.decide).toHaveBeenCalledTimes(1);
    expect(gateway.decide.mock.calls[0][1]).toEqual({
      resultado: 'aprobado',
      motivo: 'Revisión documentada',
    });

    expect(component.canDecide()).toBe(false);
  });

  it('reutiliza revisión para asesor autorizado y bloquea al perder el permiso', async () => {
    user.set({ ...USER, role: 'advisor', permissions: ['siniestros:revisar'] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.portalPath()).toBe('/asesor');
    expect(component.canDecide()).toBe(true);
    user.set({ ...USER, role: 'advisor', permissions: ['reportes:operativos'] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.claim()).toBeNull();
    expect(component.loadError()).toBe('forbidden');
    component.submit();
    expect(gateway.decide).not.toHaveBeenCalled();
  });

  it('conserva UUID y cuerpo ante 503, incluso después de cambiar el formulario', () => {
    gateway.decide.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    component.form.controls.motivo.setValue('Revisión documentada');
    component.submit();
    const first = gateway.decide.mock.calls[0];
    expect(component.decisionError()).toBe('uncertain');
    component.form.setValue({ resultado: 'rechazado', motivo: 'Un motivo diferente' });
    component.retryDecision();
    expect(gateway.decide.mock.calls[1]).toEqual(first);
  });

  it('exige consultar nuevamente el estado después de un conflicto', () => {
    gateway.decide.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    component.form.controls.motivo.setValue('Revisión documentada');
    component.submit();
    expect(component.pending()).toBeNull();
    expect(component.history()).toBeNull();
    expect(component.canDecide()).toBe(false);
    expect(component.decisionError()).toBe('conflict');
  });

  it('reconsulta estado e historial después de confirmar sin aplicar estado optimista', async () => {
    const request = new Subject<ReviewDecision>();
    gateway.decide.mockReturnValue(request);
    component.form.controls.motivo.setValue('Revisión documentada');
    component.submit();
    const key = gateway.decide.mock.calls[0][2];
    expect(component.history()?.estado).toBe('en_revision');
    gateway.history.mockReturnValue(
      of({
        ...HISTORY,
        estado: 'aprobado',
        asignacionActiva: null,
      }),
    );
    request.next({
      id: OTHER,
      siniestroId: ID,
      operacionId: key,
      origen: 'humana',
      actor: { tipo: 'revisor', id: USER.id },
      resultado: 'aprobado',
      estadoAnterior: 'en_revision',
      estadoNuevo: 'aprobado',
      motivo: 'Revisión documentada',
      decididaEn: '2026-11-25T10:00:00Z',
      asignacion: null,
    });
    request.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(gateway.history).toHaveBeenCalledTimes(2);
    expect(component.history()?.estado).toBe('aprobado');
    expect(component.pending()).toBeNull();
    expect(component.saved()).toBe(true);
    expect(component.canDecide()).toBe(false);
  });

  it('no permite resolver fraude ni una inspección desde revisión', async () => {
    gateway.history.mockReturnValue(
      of({
        ...HISTORY,
        estado: 'en_inspeccion',
        asignacionActiva: { ...HISTORY.asignacionActiva!, destino: 'inspeccion' },
      }),
    );
    component.reload();
    fixture.detectChanges();
    await fixture.whenStable();
    component.submit();
    expect(component.canDecide()).toBe(false);
    expect(gateway.decide).not.toHaveBeenCalled();
  });

  it('oculta datos y cancela respuestas antiguas cuando cambia la cuenta', async () => {
    const request = new Subject<AdministrativeClaim>();
    gateway.claim.mockReturnValue(request);
    component.reload();
    fixture.detectChanges();
    await fixture.whenStable();
    user.set({ ...USER, id: ID, role: 'client' });
    fixture.detectChanges();
    await fixture.whenStable();
    request.next(DETAIL);
    expect(component.claim()).toBeNull();
    expect(component.history()).toBeNull();
    expect(component.loadError()).toBe('forbidden');
    expect(component.canDecide()).toBe(false);
  });

  it.each(['administrator', 'advisor'] as const)(
    'no cancela una decisión por renovar el usuario %s de la misma sesión',
    async (role) => {
      const sessionUser: AuthUser = { ...USER, role, permissions: ['siniestros:revisar'] };
      user.set(sessionUser);
      fixture.detectChanges();
      await fixture.whenStable();
      const loadCount = gateway.claim.mock.calls.length;
      component.form.controls.motivo.setValue('Revisión documentada');
      component.submit();
      user.set({ ...sessionUser, permissions: [...sessionUser.permissions!] });
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.submitting()).toBe(true);
      expect(gateway.claim).toHaveBeenCalledTimes(loadCount);
    },
  );
});

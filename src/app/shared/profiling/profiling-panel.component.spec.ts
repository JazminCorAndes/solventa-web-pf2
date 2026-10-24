import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject, throwError } from 'rxjs';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import {
  ConsentRequest,
  createConsentRequest,
  ProfilingConsent,
  RiskProfile,
} from '../../core/profiling/profiling.models';
import { ProfilingPanelComponent } from './profiling-panel.component';

describe('ProfilingPanelComponent', () => {
  let fixture: ComponentFixture<ProfilingPanelComponent>;
  let component: ProfilingPanelComponent;
  const gateway = {
    loadConsent: vi.fn(),
    saveConsent: vi.fn(),
    loadProfile: vi.fn(),
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    gateway.loadConsent.mockReset().mockReturnValue(of(createConsent()));
    gateway.saveConsent.mockReset();
    gateway.loadProfile.mockReset().mockReturnValue(of(createProfile()));
    await TestBed.configureTestingModule({
      imports: [
        ProfilingPanelComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              profiling: { simulated: 'Datos simulados. No es una consulta financiera real.' },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [provideRouter([]), { provide: PROFILING_GATEWAY, useValue: gateway }],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilingPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  function openProfile(): void {
    fixture.componentRef.setInput('requestId', 'AQT-2026-123456');
    fixture.detectChanges();
  }

  it('no consulta fuentes sin consentimiento y autoriza con version cero', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    expect(gateway.loadProfile).not.toHaveBeenCalled();
    expect(component.authorized()).toBe(false);
    gateway.saveConsent.mockReturnValue(of(createConsent()));
    component.save(true);
    expect(gateway.saveConsent).toHaveBeenCalledWith({
      autorizado: true,
      version: 0,
      solicitud: {
        finalidad: 'cotizacion',
        alcances: ['open_finance', 'open_data'],
        fuentes: ['open_finance', 'open_data'],
        datos: ['indicador_riesgo'],
        versionTerminos: '1.0',
        vigenteHasta: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    expect(component.authorized()).toBe(true);
  });

  it('muestra perfil completo y fuentes simuladas de la solicitud', () => {
    openProfile();
    expect(component.profile()?.solicitudId).toBe('AQT-2026-123456');
    expect(component.profile()?.fuentes).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('No es una consulta financiera real.');
    expect(fixture.nativeElement.textContent).toContain('0.250000');
  });

  it('revoca la version actual y retira inmediatamente el perfil', () => {
    openProfile();
    gateway.saveConsent.mockReturnValue(of({ ...createConsent(), version: 2, estado: 'revocado' }));
    component.revoke();
    component.confirmRevocation();
    expect(gateway.saveConsent).toHaveBeenCalledWith({ autorizado: false, version: 1 });
    expect(component.profile()).toBeNull();
    expect(component.authorized()).toBe(false);
    expect(component.errorKey()).toBe('profiling.errors.consent');
  });

  it('oculta datos mientras consulta y cuando falla sin fallback', () => {
    openProfile();
    const pending = new Subject<ProfilingConsent>();
    gateway.loadConsent.mockReturnValue(pending);
    component.reload();
    expect(component.profile()).toBeNull();
    expect(component.loading()).toBe(true);
    pending.error(
      new HttpErrorResponse({ status: 503, error: { code: 'perfilamiento_no_disponible' } }),
    );
    expect(component.profile()).toBeNull();
    expect(component.errorKey()).toBe('profiling.errors.unavailable');
  });

  it('no consulta perfil ni habilita cotizacion mientras la aprobacion esta pendiente', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    openProfile();
    const availability = vi.fn();
    component.availabilityChange.subscribe(availability);
    const pending = new Subject<ProfilingConsent>();
    gateway.saveConsent.mockReturnValue(pending);
    component.save(true);
    component.save(true);
    component.save(false);
    expect(gateway.saveConsent).toHaveBeenCalledTimes(1);
    expect(component.loading()).toBe(true);
    expect(component.consent()).toBeNull();
    expect(component.authorized()).toBe(false);
    expect(gateway.loadProfile).not.toHaveBeenCalled();
    expect(availability).not.toHaveBeenCalledWith(true);
    pending.next(createConsent());
    expect(gateway.loadProfile).toHaveBeenCalledWith('AQT-2026-123456');
    expect(component.authorized()).toBe(true);
    expect(availability).toHaveBeenLastCalledWith(true);
  });

  it.each([
    [401, 'sesion_invalida', 'session'],
    [403, 'consentimiento_no_vigente', 'consent'],
    [409, 'conflicto_version', 'conflict'],
    [422, 'perfil_vencido', 'expired'],
    [404, 'perfil_no_encontrado', 'notFound'],
  ])('controla error %s sin mostrar datos antiguos', (status, code, key) => {
    openProfile();
    gateway.loadProfile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status, error: { code } })),
    );
    component.reload();
    expect(component.profile()).toBeNull();
    expect(component.errorKey()).toBe(`profiling.errors.${key}`);
  });

  it('exige recargar tras un conflicto sin sobrescribir automaticamente', () => {
    fixture.detectChanges();
    gateway.saveConsent.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { code: 'conflicto_version' } }),
      ),
    );
    component.revoke();
    component.confirmRevocation();
    component.revoke();
    component.confirmRevocation();
    expect(gateway.saveConsent).toHaveBeenCalledTimes(1);
    expect(component.errorKey()).toBe('profiling.errors.conflict');
    component.reload();
    expect(component.consentLoaded()).toBe(true);
  });

  it('rechaza con la solicitud mostrada sin autorizar ni consultar fuentes', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    const displayed = component.consentRequest();
    const time: HTMLTimeElement = fixture.nativeElement.querySelector('time');
    expect(time.dateTime).toBe(displayed?.vigenteHasta);
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    gateway.saveConsent.mockReturnValue(of({ ...createConsent(), estado: 'rechazado' }));
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    buttons.find((button) => button.textContent?.includes('profiling.reject'))!.click();
    expect(gateway.saveConsent).toHaveBeenCalledWith({
      autorizado: false,
      version: 0,
      solicitud: displayed,
    });
    expect(gateway.loadProfile).not.toHaveBeenCalled();
    expect(component.authorized()).toBe(false);
  });

  it.each(['rechazado', 'vencido', 'revocado'] as const)(
    'permite una nueva decision explicita tras estado %s',
    (estado) => {
      gateway.loadConsent.mockReturnValue(of({ ...createConsent(), estado }));
      openProfile();
      expect(gateway.loadProfile).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain(`profiling.consentStatus.${estado}`);
      expect(fixture.nativeElement.textContent).toContain('profiling.authorize');
      expect(fixture.nativeElement.textContent).toContain('profiling.reject');
    },
  );

  it('bloquea evidencia legada y conserva su version para una nueva decision', () => {
    gateway.loadConsent.mockReturnValue(
      of({
        ...createConsent(),
        actorId: undefined,
        fuentes: undefined,
        datos: undefined,
        versionTerminos: undefined,
      }),
    );
    openProfile();
    expect(component.incompleteEvidence()).toBe(true);
    expect(component.authorized()).toBe(false);
    expect(gateway.loadProfile).not.toHaveBeenCalled();
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    const solicitud = component.consentRequest();
    gateway.saveConsent.mockReturnValue(of({ ...createConsent(), version: 2 }));
    component.save(true);
    expect(gateway.saveConsent).toHaveBeenCalledWith({ autorizado: true, version: 1, solicitud });
  });

  it('no cambia silenciosamente la fecha presentada al decidir mas tarde', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    const solicitud = component.consentRequest();
    vi.advanceTimersByTime(60000);
    gateway.saveConsent.mockReturnValue(of(createConsent()));
    component.save(true);
    expect(gateway.saveConsent).toHaveBeenCalledWith({ autorizado: true, version: 0, solicitud });
  });

  it('no envia una decision con la fecha mostrada vencida', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    vi.advanceTimersByTime(30 * 86400000 + 1);
    component.save(true);
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    expect(component.errorKey()).toBe('profiling.errors.decisionExpired');
  });

  it.each<[Partial<ConsentRequest>, string]>([
    [{ alcances: [] }, 'scopes'],
    [{ fuentes: [] }, 'sources'],
    [{ datos: [] }, 'data'],
    [{ vigenteHasta: '' }, 'validity'],
  ])('bloquea la decision e identifica el campo incompleto %j', (change, field) => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    component.consentRequest.set({ ...createConsentRequest(Date.now()), ...change });
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    expect(
      buttons.find((button) => button.textContent?.includes('profiling.authorize'))?.disabled,
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(`profiling.decision.fields.${field}`);
    component.save(true);
    component.save(false);
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    expect(gateway.loadProfile).not.toHaveBeenCalled();
    expect(component.errorKey()).toBe('profiling.errors.incompleteRequest');
  });

  it('identifica todos los campos de una solicitud ausente sin autorizar', () => {
    gateway.loadConsent.mockReturnValue(of(null));
    fixture.detectChanges();
    component.consentRequest.set(null);
    fixture.detectChanges();
    expect(component.requestIssues()).toEqual([
      'purpose',
      'scopes',
      'sources',
      'data',
      'terms',
      'validity',
    ]);
    component.save(true);
    expect(gateway.saveConsent).not.toHaveBeenCalled();
  });

  it('conserva la autorizacion al cancelar y exige confirmacion vigente', () => {
    openProfile();
    component.confirmRevocation();
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    component.revoke();
    expect(component.confirmingRevocation()).toBe(true);
    component.cancelRevocation();
    component.confirmRevocation();
    expect(gateway.saveConsent).not.toHaveBeenCalled();
    expect(component.profile()).not.toBeNull();
    expect(component.authorized()).toBe(true);
    component.revoke();
    component.reload();
    component.confirmRevocation();
    expect(component.confirmingRevocation()).toBe(false);
    expect(gateway.saveConsent).not.toHaveBeenCalled();
  });

  it('muestra vencimiento local y bloquea la cotizacion sin navegar', () => {
    gateway.loadConsent.mockReturnValue(
      of({ ...createConsent(), vigenteHasta: new Date(Date.now() + 1000).toISOString() }),
    );
    fixture.detectChanges();
    vi.advanceTimersByTime(1001);
    fixture.detectChanges();
    expect(component.consentExpired()).toBe(true);
    expect(component.authorized()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('profiling.consentStatus.vencido');
    expect(fixture.nativeElement.textContent).not.toContain('profiling.consentStatus.autorizado');
  });

  it.each([
    (profile: RiskProfile) => ({ ...profile, solicitudId: 'otra-solicitud' }),
    (profile: RiskProfile) => ({ ...profile, consentimientoVersion: 99 }),
    (profile: RiskProfile) => ({ ...profile, fuentes: profile.fuentes.slice(0, 1) }),
    (profile: RiskProfile) => ({
      ...profile,
      vigenteHasta: new Date(Date.now() - 1).toISOString(),
    }),
  ])('rechaza perfiles parciales, ajenos o vencidos', (change) => {
    gateway.loadProfile.mockReturnValue(of(change(createProfile())));
    openProfile();
    expect(component.profile()).toBeNull();
    expect(component.errorKey()).toBe('profiling.errors.invalid');
  });

  it('retira el perfil al vencer sin necesitar navegacion', () => {
    openProfile();
    vi.advanceTimersByTime(15 * 60000 + 1);
    expect(component.profile()).toBeNull();
    expect(component.authorized()).toBe(false);
    expect(component.errorKey()).toBe('profiling.errors.expired');
  });

  it('no muestra una respuesta tardia si vencio el consentimiento durante la consulta', () => {
    gateway.loadConsent.mockReturnValue(
      of({
        ...createConsent(),
        vigenteHasta: new Date(Date.now() + 1000).toISOString(),
      }),
    );
    const pending = new Subject<RiskProfile>();
    gateway.loadProfile.mockReturnValue(pending);
    openProfile();
    vi.advanceTimersByTime(1001);
    pending.next(createProfile());
    expect(component.profile()).toBeNull();
    expect(component.authorized()).toBe(false);
    expect(component.errorKey()).toBe('profiling.errors.consent');
  });

  it('no reemplaza una respuesta nueva por una consulta anterior', () => {
    const pending = new Subject<RiskProfile>();
    gateway.loadProfile.mockReturnValue(pending);
    openProfile();
    gateway.loadProfile.mockReturnValue(of(createProfile('otra')));
    fixture.componentRef.setInput('requestId', 'otra');
    fixture.detectChanges();
    pending.next(createProfile());
    expect(component.profile()?.solicitudId).toBe('otra');
  });
});

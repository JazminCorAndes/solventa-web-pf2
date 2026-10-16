import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject, throwError } from 'rxjs';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { ProfilingConsent, RiskProfile } from '../../core/profiling/profiling.models';
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
    expect(gateway.saveConsent).toHaveBeenCalledWith(true, 0);
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
    component.save(false);
    expect(gateway.saveConsent).toHaveBeenCalledWith(false, 1);
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
    component.save(false);
    component.save(false);
    expect(gateway.saveConsent).toHaveBeenCalledTimes(1);
    expect(component.errorKey()).toBe('profiling.errors.conflict');
    component.reload();
    expect(component.consentLoaded()).toBe(true);
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

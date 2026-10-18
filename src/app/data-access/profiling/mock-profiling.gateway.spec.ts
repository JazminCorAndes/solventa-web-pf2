import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuthUser } from '../../core/auth/auth.models';
import { MockProfilingGateway } from './mock-profiling.gateway';

describe('MockProfilingGateway', () => {
  let gateway: MockProfilingGateway;
  const user = signal<AuthUser | null>(null);
  const active = vi.fn();
  const customer: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Cliente',
    email: 'cliente@solventa.co',
    role: 'client',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    user.set(customer);
    active.mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        MockProfilingGateway,
        { provide: AuthService, useValue: { user, hasActiveSession: active } },
      ],
    });
    gateway = TestBed.inject(MockProfilingGateway);
  });
  afterEach(() => vi.useRealTimers());

  it('exige sesion y autorizacion antes de crear un perfil', async () => {
    expect(() => gateway.createProfile('solicitud')).toThrow('consentimiento_no_vigente');
    active.mockReturnValue(false);
    await expect(firstValueFrom(gateway.loadConsent())).rejects.toThrow('sesion_ausente');
  });

  it('asocia el mismo perfil y consentimiento a cada solicitud', async () => {
    const consent = await firstValueFrom(gateway.saveConsent(true, 0));
    gateway.createProfile('solicitud');
    const profile = await firstValueFrom(gateway.loadProfile('solicitud'));
    expect(profile).toMatchObject({
      solicitudId: 'solicitud',
      consentimientoId: consent.consentimientoId,
      consentimientoVersion: 1,
      fallbackUsed: false,
    });
    expect(profile.fuentes.every((source) => source.simulada)).toBe(true);
    await expect(firstValueFrom(gateway.loadProfile('solicitud'))).resolves.toEqual(profile);
  });

  it('no mezcla los datos de usuarios diferentes', async () => {
    await firstValueFrom(gateway.saveConsent(true, 0));
    gateway.createProfile('solicitud');
    user.set({ ...customer, id: 'otro-cliente' });
    await expect(firstValueFrom(gateway.loadConsent())).resolves.toBeNull();
    await expect(firstValueFrom(gateway.loadProfile('solicitud'))).rejects.toThrow(
      'consentimiento_no_vigente',
    );
  });

  it('revoca sin permitir reutilizar un perfil tras renovar', async () => {
    await firstValueFrom(gateway.saveConsent(true, 0));
    gateway.createProfile('solicitud');
    await firstValueFrom(gateway.saveConsent(false, 1));
    await expect(firstValueFrom(gateway.loadProfile('solicitud'))).rejects.toThrow(
      'consentimiento_no_vigente',
    );
    await firstValueFrom(gateway.saveConsent(true, 2));
    await expect(firstValueFrom(gateway.loadProfile('solicitud'))).rejects.toThrow(
      'consentimiento_no_vigente',
    );
  });

  it('rechaza escrituras concurrentes', async () => {
    await firstValueFrom(gateway.saveConsent(true, 0));
    await expect(firstValueFrom(gateway.saveConsent(false, 0))).rejects.toThrow(
      'conflicto_version',
    );
  });

  it('aplica 15 minutos al perfil y 30 dias al consentimiento', async () => {
    const consent = await firstValueFrom(gateway.saveConsent(true, 0));
    expect(Date.parse(consent.vigenteHasta) - Date.now()).toBe(30 * 86400000);
    gateway.createProfile('solicitud');
    vi.advanceTimersByTime(15 * 60000);
    await expect(firstValueFrom(gateway.loadProfile('solicitud'))).rejects.toThrow(
      'perfil_vencido',
    );
    vi.advanceTimersByTime(30 * 86400000);
    expect(() => gateway.createProfile('nueva')).toThrow('consentimiento_no_vigente');
  });
});

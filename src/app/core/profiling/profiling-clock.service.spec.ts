import { TestBed } from '@angular/core/testing';
import { ProfilingClock } from './profiling-clock.service';
import { consentIsCurrent, profileIsCurrent } from './profiling.models';
import { createConsent, createProfile } from './profiling.fixtures';

describe('ProfilingClock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usa un limite conservador de Date y tiempo monotono sin cambiar el reloj global', () => {
    const clock = TestBed.inject(ProfilingClock);
    const now = vi.spyOn(performance, 'now').mockReturnValue(200);
    const serverTime = Date.parse('2026-10-16T04:34:12Z');
    clock.synchronize('Fri, 16 Oct 2026 04:34:12 GMT', 100);
    expect(clock.now()).toBe(serverTime + 1100);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    now.mockReturnValue(300);
    expect(clock.now()).toBe(serverTime + 1200);
  });

  it('acepta datos recien creados por AWS sin extender su vencimiento', () => {
    const clock = TestBed.inject(ProfilingClock);
    const serverTime = Date.parse('2026-10-16T04:34:12Z');
    vi.spyOn(Date, 'now').mockReturnValue(serverTime);
    vi.spyOn(performance, 'now').mockReturnValue(150);
    clock.synchronize('Fri, 16 Oct 2026 04:34:12 GMT', 0);
    const consent = { ...createConsent(), efectivaEn: new Date(serverTime + 150).toISOString() };
    const profile = createProfile();
    profile.calculadoEn = new Date(serverTime + 150).toISOString();
    profile.fuentes.forEach((source) => {
      source.consultadaEn = profile.calculadoEn;
    });
    expect(consentIsCurrent(consent, clock.now())).toBe(true);
    expect(profileIsCurrent(profile, consent, profile.solicitudId, clock.now())).toBe(true);
    profile.vigenteHasta = new Date(serverTime + 1000).toISOString();
    expect(profileIsCurrent(profile, consent, profile.solicitudId, clock.now())).toBe(false);
  });

  it.each([null, 'fecha incorrecta'])('rechaza la ausencia de reloj valido: %s', (date) => {
    const clock = TestBed.inject(ProfilingClock);
    expect(() => clock.synchronize(date, performance.now())).toThrow('reloj_no_disponible');
  });
});

import { createConsent, createProfile } from './profiling.fixtures';
import {
  consentIsCurrent,
  consentRequestIssues,
  ConsentRequest,
  createConsentRequest,
  profileIsCurrent,
  ProfilingConsent,
} from './profiling.models';

describe('Vigencia del perfilamiento', () => {
  it.each(['0', '0.000000', '0.250000', '1', '1.000000'])(
    'acepta el decimal exacto %s',
    (score) => {
      const profile = { ...createProfile(), score };
      expect(profileIsCurrent(profile, createConsent(), profile.solicitudId)).toBe(true);
    },
  );

  it.each(['-0.1', '1.1', 'NaN', 'Infinity', '0.2incorrecto', ''])(
    'rechaza el score %s',
    (score) => {
      const profile = { ...createProfile(), score };
      expect(profileIsCurrent(profile, createConsent(), profile.solicitudId)).toBe(false);
    },
  );

  it('rechaza fuentes vencidas aunque el perfil siga vigente', () => {
    const profile = createProfile();
    profile.fuentes[0].vigenteHasta = new Date(Date.now() - 1).toISOString();
    expect(profileIsCurrent(profile, createConsent(), profile.solicitudId)).toBe(false);
  });

  it('rechaza el perfil si no coincide el consentimiento', () => {
    const profile = createProfile();
    const consent = { ...createConsent(), consentimientoId: 'otro-consentimiento' };
    expect(profileIsCurrent(profile, consent, profile.solicitudId)).toBe(false);
  });

  it('no acepta consentimiento revocado, vencido o con alcance incompleto', () => {
    expect(consentIsCurrent({ ...createConsent(), estado: 'revocado' })).toBe(false);
    expect(
      consentIsCurrent({
        ...createConsent(),
        vigenteHasta: new Date(Date.now() - 1).toISOString(),
      }),
    ).toBe(false);
    expect(consentIsCurrent({ ...createConsent(), alcances: ['open_data'] })).toBe(false);
  });

  it.each<Partial<ProfilingConsent>>([
    { actorId: undefined },
    { actorId: 'otro-actor' },
    { fuentes: undefined },
    { datos: undefined },
    { versionTerminos: undefined },
    { versionTerminos: '2.0' },
    { fuentes: ['open_data'] },
    { datos: [] },
    { estado: 'rechazado' as const },
    { estado: 'vencido' as const },
  ])('no autoriza evidencia incompleta o estado no autorizado: %s', (change) => {
    const consent = { ...createConsent(), ...change };
    expect(consentIsCurrent(consent)).toBe(false);
    expect(profileIsCurrent(createProfile(), consent, 'AQT-2026-123456')).toBe(false);
  });
});

describe('Solicitud de consentimiento', () => {
  const now = Date.parse('2026-10-21T03:00:00Z');

  it('acepta la solicitud completa y un subconjunto consistente de fuentes', () => {
    const request = createConsentRequest(now);
    expect(consentRequestIssues(request, now)).toEqual([]);
    expect(
      consentRequestIssues({ ...request, alcances: ['open_data'], fuentes: ['open_data'] }, now),
    ).toEqual([]);
  });

  it.each<[Partial<ConsentRequest>, string]>([
    [{ finalidad: undefined }, 'purpose'],
    [{ versionTerminos: undefined }, 'terms'],
    [{ alcances: [] }, 'scopes'],
    [{ alcances: ['open_data', 'open_data'] }, 'scopes'],
    [{ fuentes: [] }, 'sources'],
    [{ fuentes: ['open_finance', 'open_finance'] }, 'sources'],
    [{ alcances: ['open_data'], fuentes: ['open_finance'] }, 'sources'],
    [{ datos: [] }, 'data'],
    [{ datos: ['indicador_riesgo', 'indicador_riesgo'] }, 'data'],
    [{ vigenteHasta: 'invalid' }, 'validity'],
    [{ vigenteHasta: '2026-10-22T03:00:00' }, 'validity'],
    [{ vigenteHasta: new Date(now).toISOString() }, 'validity'],
    [{ vigenteHasta: new Date(now + 30 * 86400000 + 1).toISOString() }, 'validity'],
  ])('informa el campo invalido %j', (change, field) => {
    expect(consentRequestIssues({ ...createConsentRequest(now), ...change }, now)).toContain(field);
  });
});

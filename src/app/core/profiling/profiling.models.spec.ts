import { createConsent, createProfile } from './profiling.fixtures';
import { consentIsCurrent, profileIsCurrent } from './profiling.models';

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
});

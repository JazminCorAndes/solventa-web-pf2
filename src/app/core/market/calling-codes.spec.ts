import {
  callingCode,
  callingCodeOptions,
  internationalPhone,
  nationalPhonePattern,
} from './calling-codes';
import { documentNumberFilter, documentNumberPattern } from './document-number';

describe('calling codes', () => {
  it('lista los países con nombre en español y su indicativo', () => {
    const options = callingCodeOptions();

    expect(options.length).toBeGreaterThan(200);
    expect(options).toContainEqual({ country: 'CO', name: 'Colombia', callingCode: '+57' });
    expect(new Set(options.map((option) => option.country)).size).toBe(options.length);
  });

  it('compone el teléfono en formato E.164', () => {
    expect(callingCode('PE')).toBe('+51');
    expect(callingCode('ZZ')).toBeNull();
    expect(internationalPhone('CO', '300 123 4567')).toBe('+573001234567');
  });

  it('exige 10 dígitos en Colombia y respeta el máximo E.164 en otros países', () => {
    expect(nationalPhonePattern('CO').test('3001234567')).toBe(true);
    expect(nationalPhonePattern('CO').test('300123456')).toBe(false);
    expect(nationalPhonePattern('US').test('202555012345678')).toBe(false);
    expect(nationalPhonePattern('US').test('2025550123')).toBe(true);
  });
});

describe('document number', () => {
  it('solo admite letras en pasaporte', () => {
    expect(documentNumberPattern('cc').test('1023456789')).toBe(true);
    expect(documentNumberPattern('cc').test('10234A6789')).toBe(false);
    expect(documentNumberPattern('ce').test('AB12345')).toBe(false);
    expect(documentNumberPattern('passport').test('AB123456')).toBe(true);
    expect(documentNumberFilter('ppt')).toBe('digits');
    expect(documentNumberFilter('passport')).toBe('alphanumeric');
  });
});

import { documentNumberFilter, documentNumberPattern } from './document-number';

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

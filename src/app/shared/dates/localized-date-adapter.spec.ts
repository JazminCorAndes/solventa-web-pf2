import { TestBed } from '@angular/core/testing';
import { LocalizedDateAdapter } from './localized-date-adapter';

describe('LocalizedDateAdapter', () => {
  let adapter: LocalizedDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LocalizedDateAdapter] });
    adapter = TestBed.inject(LocalizedDateAdapter);
    adapter.setLocale('es-CO');
  });

  it('interpreta día/mes/año sin confundir noviembre con enero', () => {
    expect(adapter.parse('01/11/2026')).toEqual(new Date(2026, 10, 1));
    expect(adapter.parse('30/11/2026')).toEqual(new Date(2026, 10, 30));
  });

  it('acepta fechas ISO sin cambiar el día por la zona horaria', () => {
    expect(adapter.parse('2028-02-29')).toEqual(new Date(2028, 1, 29));
  });

  it('mantiene mes/día/año al cambiar a inglés', () => {
    adapter.setLocale('en-US');
    expect(adapter.parse('11/30/2026')).toEqual(new Date(2026, 10, 30));
  });

  it.each(['31/11/2026', '29/02/2027', '00/12/2026', '12/00/2026', 'no es fecha'])(
    'rechaza una fecha imposible: %s',
    (value) => expect(adapter.isValid(adapter.parse(value)!)).toBe(false),
  );
});

import { filterInputValue } from './input-filter.directive';

describe('filterInputValue', () => {
  it('keeps only ten digits for Colombian identity and phone fields', () => {
    expect(filterInputValue('1.234.567.890-1', 'colombian-id')).toBe('1234567890');
    expect(filterInputValue('+57 300abc1234567', 'colombian-phone')).toBe('3001234567');
  });

  it('normalizes a Colombian vehicle plate', () => {
    expect(filterInputValue('ab-c 123', 'vehicle-plate')).toBe('ABC123');
    expect(filterInputValue('ABCd123', 'vehicle-plate')).toBe('ABC123');
  });

  it('filters numeric and alphanumeric document values', () => {
    expect(filterInputValue('12.34-AB56', 'digits')).toBe('123456');
    expect(filterInputValue('ab-12 34ñ', 'alphanumeric')).toBe('AB1234');
  });
});

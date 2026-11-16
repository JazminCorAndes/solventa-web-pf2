import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('uses the dark theme by default', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('toggles and persists the selected theme', () => {
    const service = TestBed.inject(ThemeService);

    service.toggle();

    expect(service.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('solventa-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem('solventa-theme')).toBe('dark');
  });

  it.each(['light', 'dark', 'invalid'])('loads saved %s using the existing single key', (saved) => {
    localStorage.setItem('solventa-theme', saved);
    const service = TestBed.inject(ThemeService);
    const expected = saved === 'light' ? 'light' : 'dark';
    expect(service.theme()).toBe(expected);
    expect(document.documentElement.dataset['theme']).toBe(expected);
    expect(document.documentElement.style.colorScheme).toBe(expected);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ThemeService } from '../../core/theme/theme.service';
import { ThemeToggleComponent } from './theme-toggle.component';
import { By } from '@angular/platform-browser';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  imports: [ThemeToggleComponent],
  template: '<app-theme-toggle /><app-theme-toggle />',
})
class TwoCallers {}

describe('shared theme controls', () => {
  beforeEach(() => {
    localStorage.removeItem('solventa-theme');
    TestBed.configureTestingModule({
      imports: [
        TwoCallers,
        TranslocoTestingModule.forRoot({
          langs: { es: { theme: { useLight: 'Usar tema claro', useDark: 'Usar tema oscuro' } } },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
    });
  });
  afterEach(() => {
    localStorage.removeItem('solventa-theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('shares the real root service, updates both names/icons and persists across reconstruction', () => {
    const fixture = TestBed.createComponent(TwoCallers);
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Usar tema claro',
      'Usar tema claro',
    ]);
    expect(
      fixture.debugElement
        .queryAll(By.directive(SvgIconComponent))
        .map((el) => el.componentInstance.name()),
    ).toEqual(['sun', 'sun']);
    buttons[0].focus();
    buttons[0].click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons.every((b) => b.getAttribute('aria-label') === 'Usar tema oscuro')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('app-icon.light')).toHaveLength(2);
    expect(
      fixture.debugElement
        .queryAll(By.directive(SvgIconComponent))
        .map((el) => el.componentInstance.name()),
    ).toEqual(['moon', 'moon']);
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('solventa-theme')).toBe('light');
    expect(buttons.every((b) => b.type === 'button' && !b.hasAttribute('aria-pressed'))).toBe(true);
    fixture.destroy();
    TestBed.resetTestingModule();
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
  });
});

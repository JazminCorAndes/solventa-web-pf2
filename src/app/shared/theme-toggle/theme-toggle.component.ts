import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/theme/theme.service';
import { SvgIconComponent } from '../svg-icon/svg-icon.component';

@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconComponent, TranslocoPipe],
  template: `
    <button
      class="theme-toggle"
      type="button"
      [attr.aria-label]="
        (theme.theme() === 'dark' ? 'theme.useLight' : 'theme.useDark') | transloco
      "
      [attr.title]="(theme.theme() === 'dark' ? 'theme.useLight' : 'theme.useDark') | transloco"
      (click)="theme.toggle()"
    >
      <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
    </button>
  `,
  styles: `
    .theme-toggle {
      display: grid;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: 1px solid var(--solventa-color-border);
      border-radius: 50%;
      color: var(--solventa-color-text);
      background: var(--solventa-color-surface-muted);
      cursor: pointer;
      place-items: center;
    }

    .theme-toggle:hover {
      border-color: var(--solventa-color-primary);
      color: var(--solventa-color-primary);
    }
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}

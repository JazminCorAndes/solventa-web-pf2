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
      <app-icon
        [class.light]="theme.theme() === 'light'"
        [name]="theme.theme() === 'dark' ? 'sun' : 'moon'"
      />
    </button>
  `,
  styles: `
    .theme-toggle {
      display: grid;
      width: var(--theme-toggle-size, 2.5rem);
      height: var(--theme-toggle-size, 2.5rem);
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

    app-icon {
      transform: rotate(-8deg);
      transition: transform 170ms ease-out;
    }

    app-icon.light {
      transform: rotate(8deg);
    }

    .theme-toggle:focus-visible {
      outline: 3px solid var(--solventa-color-text);
      outline-offset: 3px;
    }

    @media (prefers-reduced-motion: reduce) {
      app-icon,
      app-icon.light {
        transform: none;
        transition: none;
      }
    }
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}

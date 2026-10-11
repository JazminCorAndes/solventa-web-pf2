import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.compact]': 'compact()',
  },
  template: `
    <span class="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          d="M12 2.25 20 5.15v6.2c0 5.05-3.15 8.75-8 10.4-4.85-1.65-8-5.35-8-10.4v-6.2L12 2.25Z"
        />
        <path
          class="brand-letter"
          d="M15.55 7.25c-.9-.78-2.12-1.2-3.5-1.2-2.15 0-3.55.95-3.55 2.35 0 1.55 1.4 2.12 3.55 2.65 2.1.52 3.45 1.15 3.45 2.7 0 1.5-1.45 2.55-3.65 2.55-1.5 0-2.85-.45-3.85-1.35"
        />
      </svg>
    </span>
    <span class="brand-copy">
      <strong>Solventa</strong>
      @if (!compact()) {
        <small>Seguros y tranquilidad</small>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--solventa-space-2);
    }

    .brand-mark {
      display: grid;
      width: 36px;
      height: 36px;
      color: var(--solventa-color-primary);
      place-items: center;
    }

    svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }

    .brand-letter {
      fill: none;
      stroke: #ffffff;
      stroke-linecap: round;
      stroke-width: 2.35;
    }

    .brand-copy {
      display: grid;
      gap: 2px;
    }

    strong {
      color: var(--solventa-color-primary);
      font-size: 1.35rem;
      line-height: 1;
    }

    small {
      color: var(--solventa-color-text-secondary);
      font-size: 0.72rem;
    }

    :host.compact .brand-mark {
      width: 30px;
      height: 30px;
    }

    :host.compact strong {
      font-size: 1.2rem;
    }
  `,
})
export class BrandComponent {
  readonly compact = input(false);
}

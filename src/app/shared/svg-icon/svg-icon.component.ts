import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'claim'
  | 'close'
  | 'globe'
  | 'home'
  | 'logout'
  | 'menu'
  | 'moon'
  | 'policy'
  | 'shield'
  | 'sun'
  | 'user';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'svg-icon-host', 'aria-hidden': 'true' },
  template: `
    <svg
      class="svg-icon"
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="m3 10.8 9-7.2 9 7.2" />
          <path d="M5.4 9.7V21h13.2V9.7" />
          <path d="M9.4 21v-6.7h5.2V21" />
        }
        @case ('policy') {
          <path d="M6.5 3h8l3 3v15h-11z" />
          <path d="M14.5 3v4h4" />
          <path d="M9.5 11h5M9.5 15h5" />
        }
        @case ('claim') {
          <path d="M12 3 4.5 6v5.4c0 4.6 3.1 7.9 7.5 9.6 4.4-1.7 7.5-5 7.5-9.6V6z" />
          <path d="M12 8v4M12 16h.01" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h16" />
        }
        @case ('close') {
          <path d="m6 6 12 12M18 6 6 18" />
        }
        @case ('moon') {
          <path d="M20.2 15.3A8.5 8.5 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="3.7" />
          <path
            d="M12 2.5V5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3 17 7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3"
          />
        }
        @case ('user') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        }
        @case ('globe') {
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        }
        @case ('shield') {
          <path d="M12 3 4.5 6v5.4c0 4.6 3.1 7.9 7.5 9.6 4.4-1.7 7.5-5 7.5-9.6V6z" />
          <path d="m8.5 12 2.2 2.2 4.8-5" />
        }
        @case ('check') {
          <path d="m5 12 4.2 4.2L19 6.5" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14M13 6l6 6-6 6" />
        }
        @case ('arrow-left') {
          <path d="M19 12H5M11 6l-6 6 6 6" />
        }
        @case ('logout') {
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
        }
      }
    </svg>
  `,
})
export class SvgIconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { REVIEW_QUEUES } from '../../core/administration/administration.models';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../shared/brand/brand.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-administration-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    ThemeToggleComponent,
    MatButtonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  template: `
    <a class="skip-link" href="#administration-main">{{
      'navigation.skipToContent' | transloco
    }}</a>
    <header>
      <a routerLink="/administracion/colas/revision"><app-brand [compact]="true" /></a>
      <strong>{{ 'administration.portal' | transloco }}</strong>
      <span class="identity">{{ auth.user()?.name }}</span>
      <app-theme-toggle />
      <button mat-button type="button" [disabled]="loggingOut()" (click)="logout()">
        {{ 'auth.logout' | transloco }}
      </button>
    </header>
    <nav [attr.aria-label]="'navigation.primary' | transloco">
      @for (queue of queues; track queue) {
        <a mat-button [routerLink]="['/administracion/colas', queue]" routerLinkActive="active">
          {{ 'administration.queues.' + queue | transloco }}
        </a>
      }
      <a mat-button routerLink="/administracion/reportes" routerLinkActive="active">
        {{ 'advisorNavigation.reports' | transloco }}
      </a>
    </nav>
    <main id="administration-main" tabindex="-1"><router-outlet /></main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
    }
    header,
    nav {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      padding: 1rem 5%;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .identity {
      margin-inline-start: auto;
      overflow-wrap: anywhere;
    }
    main {
      max-width: 1200px;
      margin: auto;
      padding: clamp(1rem, 3vw, 2rem);
    }
    .active {
      background: var(--mat-sys-secondary-container);
    }
    .skip-link {
      position: absolute;
      inset-inline-start: 1rem;
      top: -5rem;
    }
    .skip-link:focus {
      top: 0;
      z-index: 10;
      padding: 1rem;
      background: var(--mat-sys-surface);
    }
  `,
})
export class AdministrationLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly queues = REVIEW_QUEUES;
  readonly loggingOut = signal(false);

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/iniciar-sesion']),
      error: (error: unknown) => {
        console.error('The remote session could not be closed.', error);
        void this.router.navigate(['/iniciar-sesion']);
      },
    });
  }
}

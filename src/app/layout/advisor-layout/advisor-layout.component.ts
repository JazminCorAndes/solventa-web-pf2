import { BreakpointObserver } from '@angular/cdk/layout';
import { DOCUMENT, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatListModule } from '@angular/material/list';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../shared/brand/brand.component';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-advisor-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SvgIconComponent,
    ThemeToggleComponent,
    TranslocoPipe,
    UpperCasePipe,
  ],
  templateUrl: './advisor-layout.component.html',
  styleUrl: '../authenticated-layout/authenticated-layout.component.scss',
})
export class AdvisorLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly sidenav = viewChild(MatSidenav);

  readonly user = this.auth.user;
  readonly language = signal(this.transloco.getActiveLang() || 'es');
  readonly userInitials = computed(() => {
    const name = this.user()?.name.trim() ?? '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  });
  readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 800px)')
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  toggleMenu(): void {
    void this.sidenav()?.toggle();
  }

  closeMobileMenu(): void {
    if (this.isHandset()) {
      void this.sidenav()?.close();
    }
  }

  toggleLanguage(): void {
    const language = this.language() === 'es' ? 'en' : 'es';
    this.transloco.setActiveLang(language);
    this.document.documentElement.lang = language;
    this.language.set(language);
  }

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/iniciar-sesion']),
      error: (error: unknown) => {
        console.error('The remote session could not be closed.', error);
        void this.router.navigate(['/iniciar-sesion']);
      },
    });
  }
}

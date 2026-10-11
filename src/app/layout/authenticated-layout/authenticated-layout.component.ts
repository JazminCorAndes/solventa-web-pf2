import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../shared/brand/brand.component';

@Component({
  selector: 'app-authenticated-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrandComponent,
    MatButtonModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  templateUrl: './authenticated-layout.component.html',
  styleUrl: './authenticated-layout.component.scss',
})
export class AuthenticatedLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidenav = viewChild(MatSidenav);

  readonly user = this.auth.user;
  readonly menuOpen = signal(false);
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

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/iniciar-sesion']);
  }
}

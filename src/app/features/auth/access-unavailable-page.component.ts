import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { homeUrl } from '../../core/auth/auth.guards';

@Component({
  selector: 'app-access-unavailable-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, RouterLink, TranslocoPipe],
  template: `
    <main style="max-width: 42rem; margin: 4rem auto; padding: 1.5rem">
      <h1>{{ 'partners.accessError' | transloco }}</h1>
      <p role="alert">{{ errorKey | transloco }}</p>
      <div class="actions">
        <a mat-flat-button [routerLink]="homeUrl">{{ 'partners.retry' | transloco }}</a>
        @if (user()) {
          <button mat-button type="button" (click)="logout()">
            {{ 'auth.logout' | transloco }}
          </button>
        } @else {
          <a mat-button routerLink="/iniciar-sesion">{{ 'auth.title' | transloco }}</a>
        }
      </div>
      @if (logoutFailed) {
        <p role="alert">{{ 'partners.errors.logoutUnavailable' | transloco }}</p>
      }
    </main>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 1.5rem;
    }
  `,
})
export class AccessUnavailablePageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly reason = inject(ActivatedRoute).snapshot.queryParamMap.get('reason');
  readonly homeUrl = homeUrl(this.auth.user());
  readonly user = this.auth.user;
  readonly errorKey = `partners.errors.${
    ['forbidden', 'contract', 'expired', 'quota'].includes(this.reason ?? '')
      ? this.reason
      : 'unavailable'
  }`;
  logoutFailed = false;

  logout(): void {
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/iniciar-sesion']),
      error: () => {
        this.logoutFailed = true;
      },
    });
  }
}

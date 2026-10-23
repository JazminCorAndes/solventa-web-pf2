import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { homeUrl } from '../../core/auth/auth.guards';

@Component({
  selector: 'app-access-unavailable-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <main style="max-width: 42rem; margin: 4rem auto; padding: 1.5rem">
      <h1>{{ 'partners.accessError' | transloco }}</h1>
      <p role="alert">{{ errorKey | transloco }}</p>
      <a [routerLink]="homeUrl">{{ 'partners.retry' | transloco }}</a>
      <button type="button" (click)="logout()">{{ 'auth.logout' | transloco }}</button>
      @if (logoutFailed) {
        <p role="alert">{{ 'auth.errors.unavailable' | transloco }}</p>
      }
      <a routerLink="/iniciar-sesion">{{ 'auth.title' | transloco }}</a>
    </main>
  `,
})
export class AccessUnavailablePageComponent {
  private readonly auth = inject(AuthService);
  private readonly reason = inject(ActivatedRoute).snapshot.queryParamMap.get('reason');
  readonly homeUrl = homeUrl(this.auth.user());
  readonly errorKey = `partners.errors.${
    ['forbidden', 'contract', 'expired', 'quota'].includes(this.reason ?? '')
      ? this.reason
      : 'unavailable'
  }`;
  logoutFailed = false;

  logout(): void {
    this.auth.logout().subscribe({
      error: () => {
        this.logoutFailed = true;
      },
    });
  }
}

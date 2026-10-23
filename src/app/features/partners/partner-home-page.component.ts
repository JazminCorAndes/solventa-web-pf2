import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PartnerContextService } from '../../core/partners/partner-context.service';

@Component({
  selector: 'app-partner-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (partners.context(); as context) {
      <h1>{{ 'partners.title' | transloco }}</h1>
      <p>{{ 'partners.subtitle' | transloco }}</p>
      @for (partner of context.socios; track partner.socioId) {
        <section [attr.aria-label]="partner.socioId">
          <h2>{{ partner.socioId }}</h2>
          <p>{{ 'partners.products' | transloco }}</p>
          <ul>
            @for (product of partner.productos; track product) {
              <li>{{ product }}</li>
            } @empty {
              <li>{{ 'partners.noProducts' | transloco }}</li>
            }
          </ul>
        </section>
      }
      <p>{{ 'partners.scopeNotice' | transloco }}</p>
    }
  `,
})
export class PartnerHomePageComponent {
  readonly partners = inject(PartnerContextService);
}

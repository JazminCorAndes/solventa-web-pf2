import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { PartnerContextService } from '../../core/partners/partner-context.service';

@Component({
  selector: 'app-partner-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
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
          @if (partner.productos.length && context.alcances.includes('perfilamientos:crear')) {
            <a
              routerLink="/app/socios/cotizaciones/solicitar"
              [queryParams]="{ socio: partner.socioId }"
              >{{ 'quoteRequest.submit' | transloco }}</a
            >
          }
          @if (partner.productos.length && context.alcances.includes('clientes:consultar')) {
            <a
              routerLink="/app/socios/clientes/consultar"
              [queryParams]="{ socio: partner.socioId }"
              >{{ 'clientInformation.open' | transloco }}</a
            >
          }
        </section>
      }
      <p>{{ 'partners.scopeNotice' | transloco }}</p>
    }
  `,
})
export class PartnerHomePageComponent {
  readonly partners = inject(PartnerContextService);
}

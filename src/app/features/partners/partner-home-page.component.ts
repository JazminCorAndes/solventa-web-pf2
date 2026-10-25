import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PartnerContextService } from '../../core/partners/partner-context.service';

const CREATE_QUOTE_SCOPE = 'perfilamientos:crear';
const QUERY_CLIENTS_SCOPE = 'clientes:consultar';

@Component({
  selector: 'app-partner-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  templateUrl: './partner-home-page.component.html',
  styleUrl: './partner-home-page.component.scss',
})
export class PartnerHomePageComponent {
  readonly partners = inject(PartnerContextService);

  /** Solo se resumen datos del contrato autenticado; no hay métricas de actividad simuladas. */
  readonly summary = computed(() => {
    const context = this.partners.context();
    if (!context) return null;
    const products = new Set(context.socios.flatMap((partner) => partner.productos));
    return {
      organizations: context.socios.length,
      products: products.size,
      scopes: context.alcances.length,
      canCreateQuote: context.alcances.includes(CREATE_QUOTE_SCOPE),
      canQueryClients: context.alcances.includes(QUERY_CLIENTS_SCOPE),
    };
  });
}

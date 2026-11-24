import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import {
  HttpQuoteHistoryGateway,
  PartnerQuoteHistoryEntry,
} from '../../data-access/quotes/http-quote-history.gateway';
import { partnerClientsErrorKey } from '../../data-access/partners/http-partner-clients.gateway';

@Component({
  selector: 'app-partner-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <section class="requests-page" aria-labelledby="partner-requests-title">
      <header>
        <h1 id="partner-requests-title">{{ 'partnerRequests.title' | transloco }}</h1>
        <p>{{ 'partnerRequests.subtitle' | transloco }}</p>
      </header>
      @if (context(); as current) {
        @if (current.socios.length > 1) {
          <mat-form-field appearance="outline">
            <mat-label>{{ 'clientInformation.partner' | transloco }}</mat-label>
            <mat-select
              [value]="partner()?.socioId"
              (selectionChange)="selectPartner($event.value)"
            >
              @for (organization of current.socios; track organization.socioId) {
                <mat-option [value]="organization.socioId">{{ organization.socioId }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      }
      @if (needsPartner()) {
        <p role="status">{{ 'partnerClients.choosePartner' | transloco }}</p>
      }
      @if (loading()) {
        <p role="status">{{ 'partnerRequests.loading' | transloco }}</p>
      } @else if (errorKey(); as error) {
        <p role="alert">{{ error | transloco }}</p>
      } @else if (permitted()) {
        <div class="table-container">
          <table>
            <caption>
              {{
                'partnerRequests.caption' | transloco
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ 'partnerRequests.request' | transloco }}</th>
                <th scope="col">{{ 'partnerClients.client' | transloco }}</th>
                <th scope="col">{{ 'partnerClients.document' | transloco }}</th>
                <th scope="col">{{ 'quoteSummary.requestedAt' | transloco }}</th>
                <th scope="col">{{ 'partnerRequests.selectedOffer' | transloco }}</th>
                <th scope="col">{{ 'partnerRequests.status' | transloco }}</th>
                <th scope="col">{{ 'partnerClients.actions' | transloco }}</th>
              </tr>
            </thead>
            <tbody>
              @for (request of visibleRequests(); track request.quoteId) {
                <tr [attr.data-request-id]="request.requestId">
                  <th scope="row">
                    {{ request.requestId }}
                    <small>{{ request.productId }}</small>
                  </th>
                  <td>{{ request.client.nombre ?? request.clientId }}</td>
                  <td>
                    @if (request.client.tipoDocumento) {
                      {{ 'quoteRequest.documentTypes.' + request.client.tipoDocumento | transloco }}
                      {{ request.client.numeroDocumentoEnmascarado }}
                    } @else {
                      {{ 'partnerClients.notAuthorized' | transloco }}
                    }
                  </td>
                  <td>{{ request.createdAt | date: 'medium' }}</td>
                  <td>
                    @if (
                      request.selectionState?.acceptance ?? request.selectionState?.selection;
                      as selection
                    ) {
                      <strong>{{ selection.offerName }}</strong>
                      <p>
                        {{
                          selection.premium.amount
                            | currency: selection.premium.currency : 'symbol-narrow' : '1.0-2'
                        }}
                        / {{ 'offers.premiumLabels.' + selection.periodicity | transloco }}
                      </p>
                    } @else {
                      {{
                        (request.selectionRestricted
                          ? 'partnerClients.notAuthorized'
                          : 'partnerRequests.noSelection'
                        ) | transloco
                      }}
                    }
                  </td>
                  <td>
                    <strong>{{ 'quoteSummary.status.' + request.status | transloco }}</strong>
                    @if (request.completedAt ?? request.rejectedAt; as finishedAt) {
                      <p>{{ finishedAt | date: 'medium' }}</p>
                    }
                  </td>
                  <td>
                    @if (request.status === 'pendiente' && !request.selectionRestricted) {
                      <a
                        mat-stroked-button
                        routerLink="/app/socios/cotizaciones/solicitar"
                        [queryParams]="{ socio: request.partnerId, operacion: request.operationId }"
                      >
                        {{ 'partnerRequests.viewRequest' | transloco }}
                      </a>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">{{ 'partnerRequests.empty' | transloco }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (permitted()) {
        <button mat-stroked-button type="button" [disabled]="loading()" (click)="refresh()">
          {{ 'partnerClients.refresh' | transloco }}
        </button>
      }
    </section>
  `,
  styles: `
    .requests-page {
      display: grid;
      gap: var(--solventa-space-5);
      min-width: 0;
    }
    header h1,
    header p {
      margin: 0;
    }
    header p {
      margin-top: var(--solventa-space-3);
    }
    .table-container {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    caption {
      text-align: left;
      padding-bottom: var(--solventa-space-3);
    }
    th,
    td {
      text-align: left;
      vertical-align: top;
      padding: var(--solventa-space-3);
      border-bottom: 1px solid var(--solventa-color-border);
      overflow-wrap: anywhere;
    }
    td p {
      margin: var(--solventa-space-1) 0;
    }
    small {
      display: block;
      font-weight: 400;
    }
    button {
      justify-self: start;
    }
  `,
})
export class PartnerRequestsPageComponent {
  private readonly gateway = inject(HttpQuoteHistoryGateway);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly revision = signal(0);
  private readonly requests = signal<PartnerQuoteHistoryEntry[]>([]);
  private readonly responseOwner = signal<string | null>(null);
  readonly context = inject(PartnerContextService).context;
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly partner = computed(() => {
    const partners = this.context()?.socios ?? [];
    const requested = this.query().get('socio');
    return requested !== null
      ? (partners.find((partner) => partner.socioId === requested) ?? null)
      : partners.length === 1
        ? partners[0]
        : null;
  });
  readonly needsPartner = computed(() => {
    const context = this.context();
    return !!context && context.socios.length > 1 && !this.query().has('socio');
  });
  readonly permitted = computed(
    () =>
      !!this.context()?.alcances.includes('perfilamientos:crear') &&
      !!this.partner()?.productos.length,
  );
  readonly visibleRequests = computed(() =>
    this.permitted() && this.responseOwner() === this.context()?.usuario.id
      ? this.requests().filter(
          (request) =>
            request.partnerId === this.partner()?.socioId &&
            this.partner()?.productos.includes(request.productId),
        )
      : [],
  );

  constructor() {
    effect((onCleanup) => {
      const context = this.context();
      const partner = this.partner();
      const permitted = this.permitted();
      const needsPartner = this.needsPartner();
      this.revision();
      this.requests.set([]);
      this.errorKey.set(null);
      this.loading.set(false);
      this.responseOwner.set(null);
      if (needsPartner) return;
      if (!context || !partner || !permitted) {
        this.errorKey.set('partners.errors.forbidden');
        return;
      }
      const owner = context.usuario.id;
      this.loading.set(true);
      const request = this.gateway
        .loadPartnerHistory(partner.socioId, partner.productos)
        .subscribe({
          next: (entries) => {
            if (this.context()?.usuario.id !== owner || this.partner()?.socioId !== partner.socioId)
              return;
            this.responseOwner.set(owner);
            this.requests.set(entries);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            if (this.context()?.usuario.id !== owner || this.partner()?.socioId !== partner.socioId)
              return;
            this.errorKey.set(partnerClientsErrorKey(error));
            this.loading.set(false);
          },
        });
      onCleanup(() => request.unsubscribe());
    });
  }

  refresh(): void {
    this.revision.update((value) => value + 1);
  }

  selectPartner(socioId: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { socio: socioId },
      queryParamsHandling: 'merge',
    });
  }
}

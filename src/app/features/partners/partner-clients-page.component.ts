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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import {
  HttpPartnerClientsGateway,
  partnerClientsErrorKey,
  QuotedPartnerClient,
} from '../../data-access/partners/http-partner-clients.gateway';

@Component({
  selector: 'app-partner-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <section class="clients-page" aria-labelledby="partner-clients-title">
      <header>
        <h1 id="partner-clients-title">{{ 'partnerClients.title' | transloco }}</h1>
        <p>{{ 'partnerClients.subtitle' | transloco }}</p>
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
        <p class="loading" role="status">
          <mat-spinner diameter="24" />
          {{ 'partnerClients.loading' | transloco }}
        </p>
      } @else if (errorKey(); as error) {
        <p role="alert">{{ error | transloco }}</p>
      } @else if (permitted()) {
        @if (clients().length) {
          <div class="table-container">
            <table>
              <caption>
                {{
                  'partnerClients.tableCaption' | transloco
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ 'partnerClients.client' | transloco }}</th>
                  <th scope="col">{{ 'partnerClients.document' | transloco }}</th>
                  <th scope="col">{{ 'partnerQuote.consentStatus' | transloco }}</th>
                  <th scope="col">{{ 'partnerClients.actions' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (client of clients(); track client.clienteId) {
                  <tr>
                    <th scope="row">{{ client.nombre ?? client.clienteId }}</th>
                    <td>
                      @if (client.tipoDocumento) {
                        {{ 'quoteRequest.documentTypes.' + client.tipoDocumento | transloco }}
                        {{ client.numeroDocumentoEnmascarado }}
                      } @else {
                        {{ 'partnerClients.notAuthorized' | transloco }}
                      }
                    </td>
                    <td>
                      {{ 'partnerQuote.consentStates.' + client.consentimientoEstado | transloco }}
                    </td>
                    <td>
                      @if (client.consentimientoEstado === 'vigente') {
                        <a
                          mat-stroked-button
                          routerLink="/app/socios/clientes/consultar"
                          [queryParams]="{ socio: partner()?.socioId, cliente: client.clienteId }"
                        >
                          {{ 'clientInformation.viewDetail' | transloco }}
                        </a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p role="status">{{ 'partnerClients.empty' | transloco }}</p>
        }
      }
      @if (permitted()) {
        <div class="actions">
          <button mat-stroked-button type="button" [disabled]="loading()" (click)="refresh()">
            {{ 'partnerClients.refresh' | transloco }}
          </button>
          <a
            mat-button
            routerLink="/app/socios/clientes/consultar"
            [queryParams]="{ socio: partner()?.socioId }"
          >
            {{ 'partnerClients.individual' | transloco }}
          </a>
        </div>
      }
    </section>
  `,
  styles: `
    .clients-page {
      display: grid;
      gap: var(--solventa-space-5);
      max-width: var(--solventa-content-max-width);
      margin: 0 auto;
      min-width: 0;
    }
    h1,
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
      padding: var(--solventa-space-4);
      border-bottom: 1px solid var(--solventa-color-border);
      overflow-wrap: anywhere;
    }
    .loading,
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--solventa-space-3);
    }
  `,
})
export class PartnerClientsPageComponent {
  private readonly gateway = inject(HttpPartnerClientsGateway);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  private readonly revision = signal(0);
  readonly context = inject(PartnerContextService).context;
  readonly clients = signal<QuotedPartnerClient[]>([]);
  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly partner = computed(() => {
    const partners = this.context()?.socios ?? [];
    const requested = this.queryParams().get('socio');
    return requested !== null
      ? (partners.find((partner) => partner.socioId === requested) ?? null)
      : partners.length === 1
        ? partners[0]
        : null;
  });
  readonly needsPartner = computed(() => {
    const context = this.context();
    return !!context && context.socios.length > 1 && !this.queryParams().has('socio');
  });
  readonly permitted = computed(
    () =>
      !!this.context()?.alcances.includes('clientes:consultar') &&
      !!this.partner()?.productos.includes('mortgage-life'),
  );

  constructor() {
    effect((onCleanup) => {
      const context = this.context();
      const partner = this.partner();
      const permitted = this.permitted();
      const needsPartner = this.needsPartner();
      this.revision();
      this.clients.set([]);
      this.loading.set(false);
      this.errorKey.set(null);
      if (needsPartner) return;
      if (!context || !partner || !permitted) {
        this.errorKey.set('partners.errors.forbidden');
        return;
      }
      this.loading.set(true);
      const request = this.gateway.list(partner.socioId).subscribe({
        next: (clients) => {
          this.clients.set(clients);
          this.loading.set(false);
        },
        error: (error: unknown) => {
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

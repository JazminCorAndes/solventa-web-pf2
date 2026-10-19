import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';

@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly dashboard = inject(DashboardService);
  private readonly i18n = inject(TranslocoService);

  readonly stateKeys: Readonly<Record<string, string>> = {
    PENDIENTE: 'dashboard.states.pending',
    CALCULADA: 'dashboard.states.calculated',
    aprobada: 'dashboard.states.approved',
    revision: 'dashboard.states.review',
    rechazada: 'dashboard.states.rejected',
    pago_pendiente: 'dashboard.states.paymentPending',
    pago_confirmado: 'dashboard.states.paymentConfirmed',
    emitida: 'dashboard.states.issued',
    fallida: 'dashboard.states.failed',
    confirmado: 'dashboard.states.confirmed',
    programada: 'dashboard.states.scheduled',
    vigente: 'dashboard.states.active',
    vencida: 'dashboard.states.expired',
  };

  readonly policyTypeKeys: Readonly<Record<string, string>> = {
    automotive: 'dashboard.policyTypes.automotive',
    travel: 'dashboard.policyTypes.travel',
    life: 'dashboard.policyTypes.life',
    'device-protection': 'dashboard.policyTypes.device',
    parametric: 'dashboard.policyTypes.flight',
    'parametric-weather': 'dashboard.policyTypes.weather',
    'payment-protection': 'dashboard.policyTypes.payment',
    'mortgage-life': 'dashboard.policyTypes.mortgage',
  };

  policyTypeLabel(type: string): string {
    return Object.hasOwn(this.policyTypeKeys, type)
      ? this.i18n.translate(this.policyTypeKeys[type])
      : type;
  }

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  stateLabel(state: string): string {
    const key = Object.hasOwn(this.stateKeys, state) ? this.stateKeys[state] : null;
    return key ? this.i18n.translate(key) : state;
  }

  ngOnInit(): void {
    this.dashboard.load();
  }
}

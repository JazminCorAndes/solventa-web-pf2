import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-policy-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './policy-list-page.component.html',
  styleUrl: './policy-list-page.component.scss',
})
export class PolicyListPageComponent implements OnInit {
  readonly dashboard = inject(DashboardService);
  private readonly i18n = inject(TranslocoService);

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  policyTypeLabel(type: string): string {
    const key = POLICY_TYPE_KEYS[type];
    return key ? this.i18n.translate(key) : type;
  }

  stateLabel(state: string): string {
    const key = POLICY_STATE_KEYS[state];
    return key ? this.i18n.translate(key) : state;
  }

  ngOnInit(): void {
    this.dashboard.load();
  }
}

const POLICY_TYPE_KEYS: Readonly<Record<string, string>> = {
  automotive: 'dashboard.policyTypes.automotive',
  travel: 'dashboard.policyTypes.travel',
  life: 'dashboard.policyTypes.life',
  'device-protection': 'dashboard.policyTypes.device',
  parametric: 'dashboard.policyTypes.flight',
  'parametric-weather': 'dashboard.policyTypes.weather',
  'payment-protection': 'dashboard.policyTypes.payment',
  'mortgage-life': 'dashboard.policyTypes.mortgage',
};

const POLICY_STATE_KEYS: Readonly<Record<string, string>> = {
  vigente: 'policies.states.active',
  vencida: 'policies.states.expired',
};

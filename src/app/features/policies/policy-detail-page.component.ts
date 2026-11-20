import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { SvgIconComponent } from '../../shared/svg-icon/svg-icon.component';

@Component({
  selector: 'app-policy-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterLink,
    SvgIconComponent,
    TranslocoPipe,
  ],
  templateUrl: './policy-detail-page.component.html',
  styleUrl: './policy-detail-page.component.scss',
})
export class PolicyDetailPageComponent implements OnInit {
  readonly dashboard = inject(DashboardService);
  private readonly route = inject(ActivatedRoute);
  private readonly i18n = inject(TranslocoService);
  readonly policyId = this.route.snapshot.paramMap.get('policyId') ?? '';
  readonly policy = computed(
    () => this.dashboard.snapshot()?.policies.find((item) => item.id === this.policyId) ?? null,
  );

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
  cancelada: 'policies.states.cancelled',
};

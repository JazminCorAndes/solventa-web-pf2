import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DashboardPolicy } from '../../core/dashboard/dashboard.models';
import { PolicyDocumentService } from '../../core/policies/policy-document.service';

@Component({
  selector: 'app-policy-document-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, TranslocoPipe],
  providers: [PolicyDocumentService],
  templateUrl: './policy-document-panel.component.html',
  styleUrl: './policy-document-panel.component.scss',
})
export class PolicyDocumentPanelComponent {
  readonly policy = input.required<DashboardPolicy>();
  readonly documents = inject(PolicyDocumentService);
  private readonly i18n = inject(TranslocoService);
  readonly summaryDiffers = computed(() => {
    const content = this.documents.document()?.contenido;
    const summary = this.policy();
    return (
      !!content &&
      (content.suscripcionId !== summary.subscriptionId ||
        content.vigencia.inicio !== summary.startDate ||
        content.vigencia.fin !== summary.endDate ||
        content.estado !== (summary.status === 'vigente' ? 'activa' : summary.status))
    );
  });

  constructor() {
    effect(() => {
      const policyId = this.policy().id;
      untracked(() => this.documents.load(policyId));
    });
  }

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  premiumLabel(amount: string): string {
    return new Intl.NumberFormat(this.dateLocale, {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(BigInt(amount));
  }
}

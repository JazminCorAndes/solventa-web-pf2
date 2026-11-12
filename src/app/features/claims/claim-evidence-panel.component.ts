import { DOCUMENT } from '@angular/common';
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
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { ClaimEvidence } from '../../core/claims/claim-evidence.models';
import { EVIDENCE_FORMATS, evidenceSize } from '../../core/claims/claim-evidence-file';
import { ClaimEvidenceService } from '../../core/claims/claim-evidence.service';

@Component({
  selector: 'app-claim-evidence-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, TranslocoPipe],
  providers: [ClaimEvidenceService],
  templateUrl: './claim-evidence-panel.component.html',
  styleUrl: './claim-evidence-panel.component.scss',
})
export class ClaimEvidencePanelComponent {
  readonly claimId = input.required<string>();
  readonly evidence = inject(ClaimEvidenceService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  readonly formats = EVIDENCE_FORMATS;
  readonly size = evidenceSize;
  readonly replacementErrors = new Set([
    'claimEvidence.errors.location',
    'claimEvidence.errors.unreadable',
    'claimEvidence.errors.format',
    'claimEvidence.errors.serverSize',
    'claimEvidence.errors.duration',
  ]);
  readonly visibleFiles = computed(() =>
    this.evidence
      .files()
      .filter(
        (file) => !this.evidence.evidences().some((entry) => entry.sha256 === file.body.sha256),
      ),
  );
  readonly generalError = computed(() => {
    const key = this.evidence.errorKey();
    return this.visibleFiles().some(
      (file) => file.key === this.evidence.errorFileKey() && file.errorKey === key,
    )
      ? null
      : key;
  });
  readonly duration = computed(() => {
    const seconds = this.evidence.policy()?.maxVideoSeconds ?? 0;
    return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
  });
  readonly accept = computed(
    () =>
      this.evidence
        .policy()
        ?.formatos.flatMap((format) => [
          format.mimeType,
          EVIDENCE_FORMATS[format.mimeType].extensions,
        ])
        .join(',') ?? '',
  );

  constructor() {
    effect(() => {
      const claimId = this.claimId();
      this.auth.user();
      untracked(() => this.evidence.connect(claimId));
    });
  }

  async select(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    await this.evidence.select(Array.from(input.files ?? []));
    input.value = '';
  }

  async download(evidence: ClaimEvidence): Promise<void> {
    const ownerId = this.auth.user()?.id;
    const claimId = this.claimId();
    const blob = await this.evidence.download(evidence);
    if (!blob || this.auth.user()?.id !== ownerId || this.claimId() !== claimId) return;
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'application/pdf': 'pdf',
      'video/mp4': 'mp4',
    }[evidence.mimeType];
    link.download = `${evidence.id}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

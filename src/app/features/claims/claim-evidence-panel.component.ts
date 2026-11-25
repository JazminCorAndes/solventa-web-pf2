import { DatePipe, DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import {
  ClaimEvidence,
  EvidenceLocation,
  validEvidenceMetadata,
} from '../../core/claims/claim-evidence.models';
import { EVIDENCE_FORMATS, evidenceSize } from '../../core/claims/claim-evidence-file';
import { ClaimEvidenceService } from '../../core/claims/claim-evidence.service';

@Component({
  selector: 'app-claim-evidence-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, TranslocoPipe],
  providers: [ClaimEvidenceService],
  templateUrl: './claim-evidence-panel.component.html',
  styleUrl: './claim-evidence-panel.component.scss',
})
export class ClaimEvidencePanelComponent {
  readonly claimId = input.required<string>();
  readonly evidence = inject(ClaimEvidenceService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslocoService);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  readonly locatingKey = signal<string | null>(null);
  readonly locationMessages = signal<Record<string, string>>({});
  private locationGeneration = 0;
  private watchId?: number;
  private locationTimer?: ReturnType<typeof setTimeout>;
  private readonly downloads = new Map<string, ReturnType<typeof setTimeout>>();
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
      untracked(() => {
        this.cancelLocation(false);
        this.locationMessages.set({});
        this.evidence.connect(claimId);
      });
    });
    afterNextRender(() => {
      if (this.route.snapshot.fragment !== 'evidence-title') return;
      this.title().nativeElement.focus();
      this.title().nativeElement.scrollIntoView({ block: 'start' });
      void this.evidence.load();
    });
    this.destroyRef.onDestroy(() => {
      this.cancelLocation(false);
      this.downloads.forEach((timer, url) => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      });
    });
  }

  get dateLocale(): string {
    return this.i18n.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
  }

  locate(key: string): void {
    if (!this.evidence.canEditMetadata(key) || this.locatingKey()) return;
    const geo = this.document.defaultView?.navigator.geolocation;
    if (!geo) {
      this.locationMessages.update((messages) => ({ ...messages, [key]: 'unsupported' }));
      return;
    }
    this.locatingKey.set(key);
    this.locationMessages.update((messages) => ({ ...messages, [key]: 'requesting' }));
    const generation = this.locationGeneration;
    const finish = (state: string, location?: EvidenceLocation) => {
      if (this.destroyRef.destroyed || generation !== this.locationGeneration) return;
      this.cancelLocation(false);
      if (location) this.evidence.setLocation(key, location);
      this.locationMessages.update((messages) => ({ ...messages, [key]: state }));
    };
    try {
      this.locationTimer = setTimeout(() => finish('timeout'), 12_000);
      this.watchId = geo.watchPosition(
        (position) => {
          if (this.destroyRef.destroyed || generation !== this.locationGeneration) return;
          const date = new Date(position.timestamp);
          const location: EvidenceLocation = {
            consentimiento: true,
            latitud: position.coords.latitude,
            longitud: position.coords.longitude,
            fecha:
              Number.isFinite(date.getTime()) && position.timestamp > 0 ? date.toISOString() : '',
          };
          if (!validEvidenceMetadata({ ubicacion: location })) finish('unavailable');
          else finish('attached', location);
        },
        (error) =>
          finish(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
      );
    } catch {
      finish('unavailable');
    }
  }

  cancelLocation(announce = true): void {
    const key = this.locatingKey();
    this.locationGeneration++;
    if (this.watchId !== undefined)
      this.document.defaultView?.navigator.geolocation?.clearWatch(this.watchId);
    this.watchId = undefined;
    clearTimeout(this.locationTimer);
    this.locatingKey.set(null);
    if (announce && key)
      this.locationMessages.update((messages) => ({ ...messages, [key]: 'cancelled' }));
  }

  removeLocation(key: string): void {
    this.evidence.setLocation(key, null);
    this.locationMessages.update((messages) => ({ ...messages, [key]: 'removed' }));
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
    if (
      !blob ||
      this.destroyRef.destroyed ||
      this.auth.user()?.id !== ownerId ||
      this.claimId() !== claimId
    )
      return;
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
    this.downloads.set(
      url,
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.downloads.delete(url);
      }, 1000),
    );
  }
}

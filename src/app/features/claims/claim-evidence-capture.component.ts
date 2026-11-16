import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { EvidencePolicy } from '../../core/claims/claim-evidence.models';

@Component({
  selector: 'app-claim-evidence-capture',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, TranslocoPipe],
  templateUrl: './claim-evidence-capture.component.html',
  styleUrl: './claim-evidence-capture.component.scss',
})
export class ClaimEvidenceCaptureComponent {
  readonly policy = input.required<EvidencePolicy>();
  readonly disabled = input(false);
  readonly captured = output<{ file: File; fechaCaptura: string }>();
  readonly state = signal<
    'idle' | 'requesting' | 'photo' | 'processing' | 'video' | 'recording' | 'review'
  >('idle');
  readonly message = signal<string | null>(null);
  readonly preview = signal<string | null>(null);
  readonly kind = signal<'photo' | 'video'>('photo');
  readonly video = viewChild<ElementRef<HTMLVideoElement>>('camera');
  readonly photoButton = viewChild.required<ElementRef<HTMLButtonElement>>('photoButton');
  readonly videoButton = viewChild.required<ElementRef<HTMLButtonElement>>('videoButton');
  readonly shutter = viewChild<ElementRef<HTMLButtonElement>>('shutter');
  readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton');
  readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');
  private readonly destroyRef = inject(DestroyRef);
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private timer?: ReturnType<typeof setTimeout>;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private file?: File;
  private fechaCaptura = '';

  constructor() {
    this.destroyRef.onDestroy(() => this.cleanup());
    effect(() => {
      if (this.disabled()) {
        this.cleanup();
        this.state.set('idle');
      }
    });
  }

  async open(kind: 'photo' | 'video'): Promise<void> {
    if (this.disabled()) return;
    this.cleanup();
    this.kind.set(kind);
    this.message.set(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      this.message.set('claimEvidence.capture.unsupported');
      return;
    }
    if (kind === 'video' && !this.mp4Mime()) {
      this.message.set('claimEvidence.capture.noMp4');
      return;
    }
    const generation = this.generation;
    this.state.set('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!this.current(generation)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (this.current(generation)) this.fail('claimEvidence.capture.unavailable');
        };
      });
      const video = this.video()!.nativeElement;
      video.srcObject = stream;
      await video.play();
      if (!this.current(generation)) return;
      this.state.set(kind);
      this.focusTimer = setTimeout(() => {
        if (this.current(generation)) this.shutter()?.nativeElement.focus();
      });
    } catch (error: unknown) {
      if (!this.current(generation)) return;
      this.fail(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'claimEvidence.capture.denied'
          : 'claimEvidence.capture.unavailable',
      );
    }
  }

  takePhoto(): void {
    if (this.state() !== 'photo') return;
    const video = this.video()!.nativeElement;
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      this.fail('claimEvidence.capture.unavailable');
      return;
    }
    const generation = this.generation;
    this.state.set('processing');
    this.fechaCaptura = new Date().toISOString();
    context.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!this.current(generation)) return;
        if (!blob || blob.type !== 'image/jpeg') {
          this.fail('claimEvidence.capture.unavailable');
          return;
        }
        this.review(blob, 'jpg');
      },
      'image/jpeg',
      0.92,
    );
  }

  record(): void {
    if (this.state() !== 'video' || !this.stream) return;
    const mimeType = this.mp4Mime();
    if (!mimeType) {
      this.fail('claimEvidence.capture.noMp4');
      return;
    }
    const generation = this.generation;
    const chunks: Blob[] = [];
    let bytes = 0;
    const maxBytes = this.policy().formatos.find(
      (format) => format.mimeType === 'video/mp4',
    )?.maxBytes;
    if (!maxBytes) return;
    try {
      const recorder = new MediaRecorder(this.stream, { mimeType });
      if (recorder.mimeType.split(';')[0].trim().toLowerCase() !== 'video/mp4') {
        this.fail('claimEvidence.capture.noMp4');
        return;
      }
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (!this.current(generation) || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > maxBytes) {
          this.fail('claimEvidence.capture.size');
          return;
        }
        chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (this.current(generation)) this.fail('claimEvidence.capture.unavailable');
      };
      recorder.onstop = () => {
        if (!this.current(generation)) return;
        const actualMime = chunks.find((chunk) => chunk.size)?.type ?? '';
        if (actualMime.split(';')[0].trim().toLowerCase() !== 'video/mp4') {
          this.fail('claimEvidence.capture.noMp4');
          return;
        }
        this.review(new Blob(chunks, { type: 'video/mp4' }), 'mp4');
      };
      this.fechaCaptura = new Date().toISOString();
      recorder.start(250);
      this.state.set('recording');
      this.focusTimer = setTimeout(() => {
        if (this.current(generation)) this.stopButton()?.nativeElement.focus();
      });
      this.timer = setTimeout(() => this.stopRecording(), this.policy().maxVideoSeconds * 1000);
    } catch {
      this.fail('claimEvidence.capture.noMp4');
    }
  }

  stopRecording(): void {
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.stopTracks();
  }

  keep(): void {
    if (this.state() !== 'review' || !this.file || this.disabled()) return;
    const result = { file: this.file, fechaCaptura: this.fechaCaptura };
    this.close(false);
    this.captured.emit(result);
  }

  close(cancelled = true): void {
    this.cleanup();
    this.state.set('idle');
    this.message.set(cancelled ? 'claimEvidence.capture.cancelled' : null);
    const generation = this.generation;
    this.focusTimer = setTimeout(() => {
      if (this.current(generation))
        (this.kind() === 'photo' ? this.photoButton() : this.videoButton()).nativeElement.focus();
    });
  }

  private review(blob: Blob, extension: string): void {
    this.stopTracks();
    clearTimeout(this.timer);
    this.file = new File(
      [blob],
      `evidence-${this.fechaCaptura.replace(/[:.]/g, '-')}.${extension}`,
      {
        type: blob.type,
      },
    );
    this.preview.set(URL.createObjectURL(blob));
    this.state.set('review');
    const generation = this.generation;
    this.focusTimer = setTimeout(() => {
      if (this.current(generation)) this.keepButton()?.nativeElement.focus();
    });
  }

  private mp4Mime(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    return ['video/mp4;codecs=avc1.42E01E', 'video/mp4'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
  }

  private current(generation: number): boolean {
    return !this.destroyRef.destroyed && generation === this.generation;
  }

  private fail(key: string): void {
    this.close(false);
    this.message.set(key);
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = undefined;
    const video = this.video()?.nativeElement;
    if (video) video.srcObject = null;
  }

  private cleanup(): void {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.focusTimer);
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      this.recorder = undefined;
    }
    this.stopTracks();
    const preview = this.preview();
    if (preview) URL.revokeObjectURL(preview);
    this.preview.set(null);
    this.file = undefined;
  }
}

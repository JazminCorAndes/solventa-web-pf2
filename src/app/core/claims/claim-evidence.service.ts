import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin, Observable, Subject, takeUntil } from 'rxjs';
import { HttpClaimEvidenceGateway } from '../../data-access/claims/http-claim-evidence.gateway';
import { AuthService } from '../auth/auth.service';
import { evidenceHash, validateEvidenceFile } from './claim-evidence-file';
import {
  ClaimEvidence,
  EvidenceFile,
  EvidencePolicy,
  EvidenceUpload,
  EvidenceValidationError,
  PendingEvidence,
} from './claim-evidence.models';
import { ClaimEvidenceStorage } from './claim-evidence-storage.service';

@Injectable()
export class ClaimEvidenceService {
  private readonly gateway = inject(HttpClaimEvidenceGateway);
  private readonly storage = inject(ClaimEvidenceStorage);
  private readonly auth = inject(AuthService);
  private readonly stopped = new Subject<void>();
  private generation = 0;
  private readonly owner = signal<string | null>(null);
  private claimId: string | null = null;
  private pending: PendingEvidence[] = [];
  private readonly policyState = signal<EvidencePolicy | null>(null);
  private readonly filesState = signal<EvidenceFile[]>([]);
  private readonly evidenceState = signal<ClaimEvidence[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly busyState = signal(false);
  private readonly active = computed(() => !!this.owner() && this.owner() === this.auth.user()?.id);

  readonly policy = computed(() => (this.active() ? this.policyState() : null));
  readonly files = computed(() => (this.active() ? this.filesState() : []));
  readonly evidences = computed(() => (this.active() ? this.evidenceState() : []));
  readonly errorKey = computed(() => (this.active() ? this.errorState() : null));
  readonly busy = computed(() => this.active() && this.busyState());
  readonly needsReselection = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.stopped.next();
      this.stopped.complete();
    });
  }

  connect(claimId: string): void {
    const owner = this.auth.user()?.id ?? null;
    if (this.owner() === owner && this.claimId === claimId) return;
    this.generation++;
    this.stopped.next();
    this.owner.set(owner);
    this.claimId = claimId;
    this.pending = [];
    this.policyState.set(null);
    this.filesState.set([]);
    this.evidenceState.set([]);
    this.errorState.set(null);
    this.busyState.set(false);
    this.needsReselection.set(false);
  }

  async load(): Promise<void> {
    if (!this.active() || !this.claimId || this.busy()) return;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    this.policyState.set(null);
    this.evidenceState.set([]);
    try {
      const result = await this.request(
        forkJoin({ policy: this.gateway.policy(), evidence: this.gateway.list(this.claimId) }),
      );
      if (!this.current(generation)) return;
      const pending = this.storage.read(this.owner()!, this.claimId);
      this.pending = pending.filter(
        (entry) => !result.evidence.some((evidence) => evidence.sha256 === entry.body.sha256),
      );
      this.persist();
      this.needsReselection.set(this.pending.length > 0 && this.filesState().length === 0);
      this.policyState.set(result.policy);
      this.evidenceState.set(result.evidence);
    } catch (error: unknown) {
      if (this.current(generation)) this.fail(error);
    } finally {
      if (this.current(generation)) this.busyState.set(false);
    }
  }

  async select(files: File[]): Promise<void> {
    const policy = this.policy();
    if (!policy || this.busy() || files.length === 0) return;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      if (files.length > policy.maxCantidad) {
        throw new EvidenceValidationError('claimEvidence.errors.count');
      }
      const selected: EvidenceFile[] = [];
      for (const file of files) {
        const body = await validateEvidenceFile(file, policy);
        if (!this.current(generation)) return;
        if (
          this.evidences().some((entry) => entry.sha256 === body.sha256) ||
          [...this.files(), ...selected].some((entry) => entry.body.sha256 === body.sha256)
        ) {
          throw new EvidenceValidationError('claimEvidence.errors.duplicate');
        }
        const existing = this.pending.find(
          (entry) =>
            entry.body.sha256 === body.sha256 &&
            entry.body.mimeType === body.mimeType &&
            entry.body.tamanoBytes === body.tamanoBytes,
        );
        selected.push({
          key: existing?.key ?? crypto.randomUUID(),
          body: existing?.body ?? body,
          file,
          offset: 0,
          state: 'selected',
          errorKey: null,
        });
      }
      const next = [
        ...this.pending,
        ...selected
          .filter((entry) => !this.pending.some((pending) => pending.key === entry.key))
          .map(({ key, body }) => ({ key, body })),
      ];
      if (next.length + this.evidences().length > policy.maxCantidad) {
        throw new EvidenceValidationError('claimEvidence.errors.count');
      }
      this.storage.write(this.owner()!, this.claimId!, next);
      this.pending = next;
      this.filesState.update((entries) => [...entries, ...selected]);
      this.needsReselection.set(
        this.pending.some((entry) => !this.files().some((file) => file.key === entry.key)),
      );
    } catch (error: unknown) {
      if (this.current(generation)) this.fail(error);
    } finally {
      if (this.current(generation)) this.busyState.set(false);
    }
  }

  async upload(key: string): Promise<void> {
    const entry = this.files().find((file) => file.key === key);
    const policy = this.policy();
    const claimId = this.claimId;
    if (!entry || !policy || !claimId || this.busy() || entry.state === 'confirmed') return;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    this.update(key, { state: 'uploading', errorKey: null });
    let upload: EvidenceUpload | undefined;
    try {
      upload = await this.request(this.gateway.start(claimId, entry.body, key));
      if (!this.current(generation)) return;
      upload = await this.request(this.gateway.load(claimId, upload.id, entry.body));
      if (!this.current(generation)) return;
      if (upload.estado === 'cancelada') {
        throw new EvidenceValidationError('claimEvidence.errors.cancelled');
      }
      this.update(key, { offset: upload.offset });
      while (upload.estado === 'pendiente' && upload.offset < entry.file.size) {
        const offset = upload.offset;
        const bytes = entry.file.slice(
          offset,
          Math.min(offset + policy.maxChunkBytes, entry.file.size),
        );
        const ack: EvidenceUpload = await this.request(
          this.gateway.chunk(claimId, upload.id, entry.body, offset, bytes),
        );
        if (!this.current(generation)) return;
        if (ack.estado !== 'pendiente' || ack.offset !== offset + bytes.size) {
          throw new Error('The evidence chunk acknowledgement is inconsistent.');
        }
        upload = ack;
        this.update(key, { offset: ack.offset });
      }
      if (upload.estado === 'pendiente') {
        upload = await this.request(this.gateway.confirm(claimId, upload.id, entry.body));
      }
      if (!this.current(generation)) return;
      if (upload.estado !== 'confirmada' || !upload.evidenciaId) {
        throw new Error('The evidence upload was not confirmed.');
      }
      this.update(key, { state: 'confirmed', offset: upload.offset });
      this.pending = this.pending.filter((pending) => pending.key !== key);
      this.persist();
      const evidences = await this.request(this.gateway.list(claimId));
      if (this.current(generation)) this.evidenceState.set(evidences);
    } catch (error: unknown) {
      if (!this.current(generation)) return;
      this.fail(error);
      if (this.files().find((file) => file.key === key)?.state !== 'confirmed') {
        this.update(key, { state: 'error', errorKey: this.errorState() });
        if (upload) {
          try {
            const current = await this.request(this.gateway.load(claimId, upload.id, entry.body));
            if (!this.current(generation)) return;
            this.update(key, { offset: current.offset });
          } catch (reconcileError: unknown) {
            if (this.current(generation)) this.fail(reconcileError);
          }
        }
      }
    } finally {
      if (this.current(generation)) this.busyState.set(false);
    }
  }

  async download(evidence: ClaimEvidence): Promise<Blob | null> {
    if (!this.claimId || !this.active() || this.busy()) return null;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      const blob = await this.request(this.gateway.content(this.claimId, evidence));
      if ((await evidenceHash(blob)) !== evidence.sha256) {
        throw new Error('The downloaded evidence checksum is invalid.');
      }
      return this.current(generation) ? blob : null;
    } catch (error: unknown) {
      if (this.current(generation)) this.fail(error);
      return null;
    } finally {
      if (this.current(generation)) this.busyState.set(false);
    }
  }

  private request<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(takeUntil(this.stopped)));
  }

  private current(generation: number): boolean {
    return this.generation === generation && this.active();
  }

  private persist(): void {
    this.storage.write(this.owner()!, this.claimId!, this.pending);
  }

  private update(key: string, changes: Partial<EvidenceFile>): void {
    this.filesState.update((files) =>
      files.map((file) => (file.key === key ? { ...file, ...changes } : file)),
    );
  }

  private fail(error: unknown): void {
    console.error('Claim evidence operation failed.', error);
    this.errorState.set(
      error instanceof EvidenceValidationError
        ? error.key
        : error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status)
          ? 'claimEvidence.errors.access'
          : 'claimEvidence.errors.unavailable',
    );
  }
}

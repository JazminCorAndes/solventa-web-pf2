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
  private readonly pendingState = signal<PendingEvidence[]>([]);
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
  readonly restored = computed(() =>
    this.active()
      ? this.pendingState().filter((entry) => !this.files().some((file) => file.key === entry.key))
      : [],
  );
  readonly needsReselection = computed(() => this.restored().length > 0);

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
    this.pendingState.set([]);
    this.policyState.set(null);
    this.filesState.set([]);
    this.evidenceState.set([]);
    this.errorState.set(null);
    this.busyState.set(false);
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
      this.savePending(
        pending.filter(
          (entry) => !result.evidence.some((evidence) => evidence.sha256 === entry.body.sha256),
        ),
      );
      this.policyState.set(result.policy);
      this.evidenceState.set(result.evidence);
      this.filesState.update((files) =>
        files.map((file) =>
          result.evidence.some((evidence) => evidence.sha256 === file.body.sha256)
            ? { ...file, state: 'confirmed', offset: file.body.tamanoBytes, errorKey: null }
            : file,
        ),
      );
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
        const existing = this.pendingState().find(
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
          state: existing?.disposition === 'rejected' ? 'error' : 'selected',
          errorKey: existing?.disposition === 'rejected' ? 'claimEvidence.errors.rejected' : null,
        });
      }
      const next = [
        ...this.pendingState(),
        ...selected
          .filter((entry) => !this.pendingState().some((pending) => pending.key === entry.key))
          .map(({ key, body }): PendingEvidence => ({ key, body, disposition: 'local' })),
      ];
      const confirmedNotListed = this.files().filter(
        (file) =>
          file.state === 'confirmed' &&
          !next.some((entry) => entry.key === file.key) &&
          !this.evidences().some((evidence) => evidence.sha256 === file.body.sha256),
      ).length;
      if (next.length + this.evidences().length + confirmedNotListed > policy.maxCantidad) {
        throw new EvidenceValidationError('claimEvidence.errors.count');
      }
      this.savePending(next);
      this.filesState.update((entries) => [...entries, ...selected]);
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
    if (this.isRejected(key)) {
      this.fail(new EvidenceValidationError('claimEvidence.errors.rejected'));
      return;
    }
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    this.update(key, { state: 'uploading', errorKey: null });
    let upload: EvidenceUpload | undefined;
    try {
      this.setDisposition(key, 'remote');
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
      this.savePending(this.pendingState().filter((pending) => pending.key !== key));
      const evidences = await this.request(this.gateway.list(claimId));
      if (this.current(generation)) this.evidenceState.set(evidences);
    } catch (error: unknown) {
      if (!this.current(generation)) return;
      this.fail(error);
      if (this.files().find((file) => file.key === key)?.state !== 'confirmed') {
        this.update(key, { state: 'error', errorKey: this.errorState() });
        if (!upload && startRejected(error)) {
          try {
            this.setDisposition(key, 'rejected');
            this.errorState.set('claimEvidence.errors.rejected');
            this.update(key, { errorKey: this.errorState() });
          } catch (storageError: unknown) {
            this.fail(storageError);
          }
        }
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

  isRejected(key: string): boolean {
    return (
      this.active() &&
      this.pendingState().some((entry) => entry.key === key && entry.disposition === 'rejected')
    );
  }

  async remove(key: string): Promise<void> {
    const entry = this.pendingState().find((pending) => pending.key === key);
    const claimId = this.claimId;
    if (!this.active() || !entry || !claimId || this.busy()) return;
    const generation = this.generation;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      if (this.files().some((file) => file.key === key && file.state === 'confirmed')) {
        throw new EvidenceValidationError('claimEvidence.errors.confirmed');
      }
      if (entry.disposition !== 'local' && entry.disposition !== 'rejected') {
        // Legacy entries and lost acknowledgements may already reserve remote quota.
        let upload: EvidenceUpload;
        try {
          upload = await this.request(this.gateway.start(claimId, entry.body, key));
        } catch (error: unknown) {
          if (!this.current(generation)) return;
          if (!startRejected(error)) throw error;
          this.setDisposition(key, 'rejected');
          this.discard(key);
          return;
        }
        if (!this.current(generation)) return;
        upload = await this.request(this.gateway.load(claimId, upload.id, entry.body));
        if (!this.current(generation)) return;
        if (upload.estado === 'pendiente') {
          let cancellationError: unknown;
          try {
            await this.request(this.gateway.cancel(claimId, upload.id));
          } catch (error: unknown) {
            cancellationError = error;
          }
          if (!this.current(generation)) return;
          upload = await this.request(this.gateway.load(claimId, upload.id, entry.body));
          if (!this.current(generation)) return;
          if (upload.estado === 'pendiente') {
            throw cancellationError ?? new Error('The evidence cancellation was not confirmed.');
          }
        }
        if (upload.estado === 'confirmada') {
          this.update(key, { state: 'confirmed', offset: upload.offset });
          const evidences = await this.request(this.gateway.list(claimId));
          if (!this.current(generation)) return;
          if (!evidences.some((evidence) => evidence.id === upload.evidenciaId)) {
            throw new Error('The confirmed evidence is missing from the list.');
          }
          this.evidenceState.set(evidences);
          this.savePending(this.pendingState().filter((pending) => pending.key !== key));
          throw new EvidenceValidationError('claimEvidence.errors.confirmed');
        }
      }
      this.discard(key);
    } catch (error: unknown) {
      if (this.current(generation)) this.fail(error);
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

  private savePending(entries: PendingEvidence[]): void {
    this.storage.write(this.owner()!, this.claimId!, entries);
    this.pendingState.set(entries);
  }

  private setDisposition(key: string, disposition: PendingEvidence['disposition']): void {
    this.savePending(
      this.pendingState().map((entry) => (entry.key === key ? { ...entry, disposition } : entry)),
    );
  }

  private discard(key: string): void {
    this.savePending(this.pendingState().filter((entry) => entry.key !== key));
    this.filesState.update((files) => files.filter((file) => file.key !== key));
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

function startRejected(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  const body: unknown = error.error;
  return (
    [400, 413, 415, 422].includes(error.status) ||
    (error.status === 409 &&
      body !== null &&
      typeof body === 'object' &&
      'code' in body &&
      body.code === 'limite_cantidad')
  );
}

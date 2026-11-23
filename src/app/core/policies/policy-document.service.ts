import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core';
import { finalize, Subject, takeUntil } from 'rxjs';
import { HttpPolicyDocumentGateway } from '../../data-access/policies/http-policy-document.gateway';
import { AuthService } from '../auth/auth.service';
import {
  DOCUMENT_HASH,
  DOCUMENT_UUID,
  DocumentAcceptance,
  DocumentAcceptanceAttempt,
  DocumentErrorKind,
  PolicyDocument,
  PolicyDocumentError,
  sameDocument,
} from './policy-document.models';

@Injectable()
export class PolicyDocumentService implements OnDestroy {
  private readonly gateway = inject(HttpPolicyDocumentGateway);
  private readonly auth = inject(AuthService);
  private readonly browserDocument = inject(DOCUMENT);
  private readonly cancelled = new Subject<void>();
  private owner: string | null = null;
  private policyId = '';
  private readonly documentState = signal<PolicyDocument | null>(null);
  private readonly attemptState = signal<DocumentAcceptanceAttempt | null>(null);
  private readonly receiptState = signal<DocumentAcceptance | null>(null);

  readonly document = computed(() => (this.ownsSession() ? this.documentState() : null));
  readonly attempt = computed(() => (this.ownsSession() ? this.attemptState() : null));
  readonly receipt = computed(() => (this.ownsSession() ? this.receiptState() : null));
  readonly consent = signal(false);
  readonly loading = signal(false);
  readonly accepting = signal(false);
  readonly downloading = signal(false);
  readonly error = signal<DocumentErrorKind | null>(null);
  readonly notice = signal<'outdated' | null>(null);
  readonly canAccept = computed(
    () =>
      !!this.document() &&
      !this.document()?.aceptacionActual &&
      !this.attempt() &&
      this.consent() &&
      !this.error() &&
      !this.loading() &&
      !this.accepting(),
  );
  readonly canRecover = computed(
    () =>
      !!this.document() &&
      !!this.attempt() &&
      !this.attempt()?.conflict &&
      sameDocument(this.document()!, this.attempt()!.body) &&
      !this.loading() &&
      !this.accepting() &&
      (!this.error() || this.error() === 'ambiguous'),
  );

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (this.owner && (user?.id !== this.owner || user.role !== 'client')) {
        untracked(() => {
          this.cancelled.next();
          this.documentState.set(null);
          this.attemptState.set(null);
          this.receiptState.set(null);
          this.consent.set(false);
          this.error.set('session');
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.cancelled.next();
    this.cancelled.complete();
  }

  load(policyId: string, preserveReceipt = false): void {
    if (this.accepting()) return;
    this.cancelled.next();
    this.policyId = policyId;
    this.owner = this.auth.user()?.role === 'client' ? this.auth.user()!.id : null;
    this.documentState.set(null);
    this.attemptState.set(null);
    if (!preserveReceipt) this.receiptState.set(null);
    this.consent.set(false);
    this.error.set(null);
    if (!this.ownsSession()) {
      this.error.set('session');
      return;
    }
    if (!DOCUMENT_UUID.test(policyId)) {
      this.error.set('invalid');
      return;
    }
    try {
      this.attemptState.set(this.readAttempt());
    } catch (error) {
      this.fail(error, 'storage');
      return;
    }
    this.loading.set(true);
    this.gateway
      .load(policyId, this.owner!)
      .pipe(
        takeUntil(this.cancelled),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (document) => {
          if (!this.ownsSession()) return;
          this.documentState.set(document);
          try {
            const attempt = this.readAttempt();
            this.attemptState.set(attempt);
            if (attempt) {
              if (!sameDocument(document, attempt.body)) {
                this.removeAttempt(attempt);
                this.notice.set('outdated');
              } else if (document.aceptacionActual) {
                this.removeAttempt(attempt);
              } else if (attempt.conflict) {
                this.error.set('keyConflict');
              }
            }
          } catch (error) {
            this.fail(error, 'storage');
          }
        },
        error: (error: unknown) => this.fail(error, 'unavailable'),
      });
  }

  accept(): void {
    if (!this.canAccept()) {
      this.error.set('invalidRequest');
      return;
    }
    const document = this.document()!;
    let attempt: DocumentAcceptanceAttempt;
    try {
      if (this.readAttempt()) throw new PolicyDocumentError('storage');
      attempt = {
        key: crypto.randomUUID(),
        body: {
          documentoId: document.documentoId,
          versionPoliza: document.versionPoliza,
          contenidoHash: document.contenidoHash,
          aceptaSimulacion: true,
        },
        conflict: false,
      };
      this.saveAttempt(attempt);
    } catch (error) {
      this.fail(error, 'storage');
      return;
    }
    this.send(attempt);
  }

  recover(): void {
    if (!this.canRecover()) {
      this.error.set('invalidRequest');
      return;
    }
    this.send(this.attempt()!);
  }

  download(): void {
    const document = this.document();
    if (!document || this.loading() || this.downloading()) return;
    this.downloading.set(true);
    this.gateway
      .download(document)
      .pipe(
        takeUntil(this.cancelled),
        finalize(() => this.downloading.set(false)),
      )
      .subscribe({
        next: (bytes) => {
          if (!this.ownsSession()) return;
          try {
            const url = URL.createObjectURL(new Blob([bytes], { type: 'text/html;charset=utf-8' }));
            try {
              const anchor = this.browserDocument.createElement('a');
              anchor.href = url;
              anchor.download = `poliza-${document.polizaId}-${document.documentoId}.html`;
              anchor.click();
            } finally {
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }
          } catch (error) {
            this.fail(error, 'download');
          }
        },
        error: (error: unknown) => this.fail(error, 'download'),
      });
  }

  private send(attempt: DocumentAcceptanceAttempt): void {
    try {
      if (!this.ownsSession() || JSON.stringify(this.readAttempt()) !== JSON.stringify(attempt)) {
        throw new PolicyDocumentError('storage');
      }
    } catch (error) {
      this.fail(error, 'storage');
      return;
    }
    this.consent.set(false);
    this.notice.set(null);
    this.error.set(null);
    this.accepting.set(true);
    this.gateway
      .accept(this.policyId, this.owner!, attempt)
      .pipe(
        takeUntil(this.cancelled),
        finalize(() => this.accepting.set(false)),
      )
      .subscribe({
        next: (receipt) => {
          if (!this.ownsSession()) return;
          this.receiptState.set(receipt);
          try {
            this.removeAttempt(attempt);
            this.accepting.set(false);
            this.load(this.policyId, true);
          } catch (error) {
            this.fail(error, 'storage');
          }
        },
        error: (error: unknown) => {
          if (!this.ownsSession()) return;
          const kind = error instanceof PolicyDocumentError ? error.kind : 'ambiguous';
          this.error.set(kind === 'invalid' ? 'ambiguous' : kind);
          try {
            if (kind === 'outdated' || kind === 'invalidRequest') {
              this.removeAttempt(attempt);
              this.accepting.set(false);
              if (kind === 'outdated') {
                this.notice.set('outdated');
                this.load(this.policyId);
              }
            } else if (kind === 'keyConflict') {
              this.saveAttempt({ ...attempt, conflict: true });
            }
          } catch (storageError) {
            this.fail(storageError, 'storage');
          }
        },
      });
  }

  private ownsSession(): boolean {
    return (
      !!this.owner && this.auth.user()?.id === this.owner && this.auth.user()?.role === 'client'
    );
  }

  private storageKey(): string {
    if (!this.ownsSession()) throw new PolicyDocumentError('session');
    return `solventa.policy-document.v1.${this.owner}.${this.policyId}`;
  }

  private storage(): Storage {
    const storage = this.browserDocument.defaultView?.sessionStorage;
    if (!storage) throw new PolicyDocumentError('storage');
    return storage;
  }

  private readAttempt(): DocumentAcceptanceAttempt | null {
    const raw = this.storage().getItem(this.storageKey());
    if (raw === null) return null;
    const attempt: unknown = JSON.parse(raw);
    if (!attempt || typeof attempt !== 'object') throw new PolicyDocumentError('storage');
    const fields = attempt as Record<string, unknown>;
    const body = fields['body'];
    if (!body || typeof body !== 'object') throw new PolicyDocumentError('storage');
    const data = body as Record<string, unknown>;
    const version = data['versionPoliza'];
    if (
      typeof fields['key'] !== 'string' ||
      !DOCUMENT_UUID.test(fields['key']) ||
      typeof fields['conflict'] !== 'boolean' ||
      typeof data['documentoId'] !== 'string' ||
      !DOCUMENT_UUID.test(data['documentoId']) ||
      typeof data['contenidoHash'] !== 'string' ||
      !DOCUMENT_HASH.test(data['contenidoHash']) ||
      !(
        version === null ||
        (typeof version === 'number' && Number.isSafeInteger(version) && version >= 1)
      ) ||
      data['aceptaSimulacion'] !== true ||
      Object.keys(data).sort().join(',') !==
        'aceptaSimulacion,contenidoHash,documentoId,versionPoliza'
    ) {
      throw new PolicyDocumentError('storage');
    }
    return {
      key: fields['key'],
      body: {
        documentoId: data['documentoId'],
        versionPoliza: version,
        contenidoHash: data['contenidoHash'],
        aceptaSimulacion: true,
      },
      conflict: fields['conflict'],
    };
  }

  private saveAttempt(attempt: DocumentAcceptanceAttempt): void {
    const value = JSON.stringify(attempt);
    this.storage().setItem(this.storageKey(), value);
    if (this.storage().getItem(this.storageKey()) !== value) {
      throw new PolicyDocumentError('storage');
    }
    this.attemptState.set(attempt);
  }

  private removeAttempt(expected: DocumentAcceptanceAttempt): void {
    if (JSON.stringify(this.readAttempt()) !== JSON.stringify(expected)) {
      throw new PolicyDocumentError('storage');
    }
    this.storage().removeItem(this.storageKey());
    if (this.readAttempt() !== null) throw new PolicyDocumentError('storage');
    this.attemptState.set(null);
  }

  private fail(error: unknown, fallback: DocumentErrorKind): void {
    this.error.set(error instanceof PolicyDocumentError ? error.kind : fallback);
  }
}

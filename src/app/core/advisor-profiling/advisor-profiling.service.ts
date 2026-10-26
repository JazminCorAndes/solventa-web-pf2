import { effect, inject, Injectable, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ADVISOR_PROFILING_GATEWAY } from './advisor-profiling.gateway';
import {
  MortgageProfilingInput,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
  MortgageProfilingError,
} from './advisor-profiling.models';
import { ADVISOR_PROFILING_STORAGE } from './advisor-profiling-storage.service';
import { AuthService } from '../auth/auth.service';
import { isPartnerIds } from '../auth/auth.models';

@Injectable({ providedIn: 'root' })
export class AdvisorProfilingService {
  private readonly gateway = inject(ADVISOR_PROFILING_GATEWAY);
  private readonly storage = inject(ADVISOR_PROFILING_STORAGE);
  private readonly auth = inject(AuthService);
  private ownerId = this.auth.user()?.id ?? null;
  private fingerprint: string | null = null;
  private readonly operationState = signal(this.storage.read());
  readonly pendingOperation = this.operationState.asReadonly();

  constructor() {
    this.synchronizeOwner();
    effect(() => this.synchronizeOwner());
  }

  start(input: MortgageProfilingInput): Observable<MortgageProfilingRecord> {
    this.synchronizeOwner();
    const user = this.auth.user();
    if (
      user?.role !== 'advisor' ||
      !isPartnerIds(user.partnerIds) ||
      !user.partnerIds.includes(input.partnerId)
    ) {
      return throwError(() => new MortgageProfilingError('unauthorized_partner'));
    }
    const fingerprint = JSON.stringify(input);
    const pending = this.storage.read();
    if (
      pending &&
      (pending.partnerId !== input.partnerId ||
        (this.fingerprint !== null && this.fingerprint !== fingerprint))
    ) {
      return throwError(() => new MortgageProfilingError('idempotency_conflict'));
    }
    const operationId = pending?.operationId ?? crypto.randomUUID();

    // Tras recarga solo queda el UUID: el servidor valida los datos reintroducidos en el replay.
    if (!pending) this.fingerprint = fingerprint;
    const operation = { ownerId: user.id, partnerId: input.partnerId, operationId };
    this.storage.write(operation);
    this.operationState.set(operation);
    const request: MortgageProfilingRequest = { ...input, operationId };
    return this.gateway.start(request);
  }

  reset(): void {
    this.storage.clear();
    this.fingerprint = null;
    this.operationState.set(null);
  }

  private synchronizeOwner(): void {
    const user = this.auth.user();
    const ownerId = user?.role === 'advisor' ? user.id : null;
    const pending = this.storage.read();
    if (
      ownerId !== this.ownerId ||
      !ownerId ||
      (pending &&
        (pending.ownerId !== ownerId ||
          !isPartnerIds(user?.partnerIds) ||
          !user.partnerIds.includes(pending.partnerId)))
    ) {
      this.reset();
    }
    this.ownerId = ownerId;
  }
}

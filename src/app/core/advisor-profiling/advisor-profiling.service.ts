import { effect, inject, Injectable, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { PARTNER_PROFILING_GATEWAY } from './advisor-profiling.gateway';
import {
  MortgageProfilingInput,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
  MortgageProfilingError,
} from './advisor-profiling.models';
import { PARTNER_PROFILING_STORAGE } from './advisor-profiling-storage.service';
import { AuthService } from '../auth/auth.service';
import { isPartnerIds } from '../auth/auth.models';
import { PartnerContextService } from '../partners/partner-context.service';

@Injectable({ providedIn: 'root' })
export class PartnerProfilingService {
  private readonly gateway = inject(PARTNER_PROFILING_GATEWAY);
  private readonly storage = inject(PARTNER_PROFILING_STORAGE);
  private readonly auth = inject(AuthService);
  private readonly partners = inject(PartnerContextService);
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
      user?.role !== 'partner' ||
      !isPartnerIds(user.partnerIds) ||
      !user.partnerIds.includes(input.partnerId) ||
      !this.authorizedPartnerIds().includes(input.partnerId)
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

  authorizedPartnerIds(): string[] {
    const user = this.auth.user();
    const context = this.partners.context();
    if (
      user?.role !== 'partner' ||
      !isPartnerIds(user.partnerIds) ||
      context?.usuario.id !== user.id ||
      !context.alcances.includes('perfilamientos:crear') ||
      !context.alcances.includes('clientes:consultar')
    ) {
      return [];
    }
    const partnerIds = user.partnerIds;
    return context.socios
      .filter(
        (partner) =>
          partnerIds.includes(partner.socioId) && partner.productos.includes('mortgage-life'),
      )
      .map((partner) => partner.socioId);
  }

  private synchronizeOwner(): void {
    const user = this.auth.user();
    const ownerId = user?.role === 'partner' ? user.id : null;
    const pending = this.storage.read();
    if (
      ownerId !== this.ownerId ||
      !ownerId ||
      (pending &&
        (pending.ownerId !== ownerId ||
          !isPartnerIds(user?.partnerIds) ||
          !user.partnerIds.includes(pending.partnerId) ||
          (this.partners.context() !== null &&
            !this.authorizedPartnerIds().includes(pending.partnerId))))
    ) {
      this.reset();
    }
    this.ownerId = ownerId;
  }
}

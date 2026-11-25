import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { CANCELLATION_REASONS, CancellationAttempt } from './policy-cancellation.models';
import { POLICY_ID_PATTERN } from './policy-renewal.models';

@Injectable({ providedIn: 'root' })
export class PolicyCancellationAttempts {
  private readonly document = inject(DOCUMENT);

  read(ownerId: string, policyId: string): CancellationAttempt | null {
    const raw = this.storage().getItem(this.key(ownerId, policyId));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') {
      throw new Error('The saved cancellation attempt is invalid.');
    }
    const fields = value as Record<string, unknown>;
    if (
      typeof fields['key'] !== 'string' ||
      !POLICY_ID_PATTERN.test(fields['key']) ||
      typeof fields['settlementHash'] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(fields['settlementHash']) ||
      !CANCELLATION_REASONS.some((reason) => reason === fields['reason'])
    ) {
      throw new Error('The saved cancellation attempt is invalid.');
    }
    return {
      key: fields['key'],
      settlementHash: fields['settlementHash'],
      reason: fields['reason'] as CancellationAttempt['reason'],
    };
  }

  save(ownerId: string, policyId: string, attempt: CancellationAttempt): void {
    this.storage().setItem(this.key(ownerId, policyId), JSON.stringify(attempt));
  }

  clear(ownerId: string, policyId: string): void {
    this.storage().removeItem(this.key(ownerId, policyId));
  }

  private storage(): Storage {
    const storage = this.document.defaultView?.sessionStorage;
    if (!storage) throw new Error('Cancellation recovery storage is unavailable.');
    return storage;
  }

  private key(ownerId: string, policyId: string): string {
    return `solventa.cancellation.backend.${ownerId}.${policyId.toLowerCase()}`;
  }
}

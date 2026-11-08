import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { EVIDENCE_MIMES, PendingEvidence } from './claim-evidence.models';

@Injectable({ providedIn: 'root' })
export class ClaimEvidenceStorage {
  private readonly document = inject(DOCUMENT);

  read(ownerId: string, claimId: string): PendingEvidence[] {
    const value = this.storage().getItem(this.key(ownerId, claimId));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isPendingEvidence)) {
      throw new Error('Invalid stored evidence operations.');
    }
    if (new Set(parsed.map((entry) => entry.key)).size !== parsed.length) {
      throw new Error('Duplicate stored evidence operations.');
    }
    return parsed;
  }

  write(ownerId: string, claimId: string, entries: PendingEvidence[]): void {
    this.storage().setItem(this.key(ownerId, claimId), JSON.stringify(entries));
  }

  private storage(): Storage {
    const storage = this.document.defaultView?.sessionStorage;
    if (!storage) throw new Error('Evidence retry storage is unavailable.');
    return storage;
  }

  private key(ownerId: string, claimId: string): string {
    return `solventa.evidence.${encodeURIComponent(ownerId)}.${encodeURIComponent(claimId.toLowerCase())}`;
  }
}

function isPendingEvidence(value: unknown): value is PendingEvidence {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PendingEvidence>;
  const body = entry.body;
  return (
    typeof entry.key === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.key) &&
    !!body &&
    EVIDENCE_MIMES.includes(body.mimeType) &&
    Number.isSafeInteger(body.tamanoBytes) &&
    body.tamanoBytes > 0 &&
    typeof body.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(body.sha256)
  );
}

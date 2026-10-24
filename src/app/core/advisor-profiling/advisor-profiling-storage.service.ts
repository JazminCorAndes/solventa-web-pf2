import { InjectionToken, Injectable } from '@angular/core';

export interface PendingMortgageProfilingOperation {
  fingerprint: string;
  operationId: string;
}

export interface AdvisorProfilingStorage {
  read(): PendingMortgageProfilingOperation | null;
  write(operation: PendingMortgageProfilingOperation): void;
  clear(): void;
}

export const ADVISOR_PROFILING_STORAGE = new InjectionToken<AdvisorProfilingStorage>(
  'ADVISOR_PROFILING_STORAGE',
);

const STORAGE_KEY = 'solventa.advisor.mortgage-profiling-operation';

@Injectable()
export class BrowserAdvisorProfilingStorage implements AdvisorProfilingStorage {
  read(): PendingMortgageProfilingOperation | null {
    const value = sessionStorage.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    try {
      const operation = JSON.parse(value) as Partial<PendingMortgageProfilingOperation>;
      return typeof operation.fingerprint === 'string' && typeof operation.operationId === 'string'
        ? { fingerprint: operation.fingerprint, operationId: operation.operationId }
        : null;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  write(operation: PendingMortgageProfilingOperation): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(operation));
  }

  clear(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

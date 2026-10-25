import { InjectionToken, Injectable } from '@angular/core';
import { MORTGAGE_UUID_PATTERN } from './advisor-profiling.models';

export interface PendingMortgageProfilingOperation {
  ownerId: string;
  partnerId: string;
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
      if (
        operation &&
        typeof operation.ownerId === 'string' &&
        operation.ownerId.trim().length > 0 &&
        typeof operation.partnerId === 'string' &&
        operation.partnerId.trim().length > 0 &&
        typeof operation.operationId === 'string' &&
        MORTGAGE_UUID_PATTERN.test(operation.operationId) &&
        Object.keys(operation).every((key) => ['ownerId', 'partnerId', 'operationId'].includes(key))
      ) {
        return {
          ownerId: operation.ownerId,
          partnerId: operation.partnerId,
          operationId: operation.operationId,
        };
      }
      this.clear();
      return null;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  write(operation: PendingMortgageProfilingOperation): void {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ownerId: operation.ownerId,
        partnerId: operation.partnerId,
        operationId: operation.operationId,
      }),
    );
  }

  clear(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

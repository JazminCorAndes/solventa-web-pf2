import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ADVISOR_PROFILING_GATEWAY } from './advisor-profiling.gateway';
import {
  MortgageProfilingInput,
  MortgageProfilingRecord,
  MortgageProfilingRequest,
} from './advisor-profiling.models';
import { ADVISOR_PROFILING_STORAGE } from './advisor-profiling-storage.service';

@Injectable({ providedIn: 'root' })
export class AdvisorProfilingService {
  private readonly gateway = inject(ADVISOR_PROFILING_GATEWAY);
  private readonly storage = inject(ADVISOR_PROFILING_STORAGE);

  start(input: MortgageProfilingInput): Observable<MortgageProfilingRecord> {
    const fingerprint = JSON.stringify(input);
    const pending = this.storage.read();
    const operationId =
      pending?.fingerprint === fingerprint ? pending.operationId : crypto.randomUUID();

    this.storage.write({ fingerprint, operationId });
    const request: MortgageProfilingRequest = { ...input, operationId };
    return this.gateway.start(request);
  }

  reset(): void {
    this.storage.clear();
  }
}

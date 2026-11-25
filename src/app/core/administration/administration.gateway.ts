import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdministrativeClaim,
  AdministrativeEvidence,
  ReviewDecision,
  ReviewHistory,
  ReviewInput,
  ReviewQueue,
  ReviewQueueItem,
} from './administration.models';

export interface AdministrationGateway {
  queue(queue: ReviewQueue): Observable<ReviewQueueItem[]>;
  claim(id: string): Observable<AdministrativeClaim>;
  history(id: string): Observable<ReviewHistory>;
  decide(id: string, input: ReviewInput, key: string): Observable<ReviewDecision>;
  content(id: string, evidence: AdministrativeEvidence): Observable<Blob>;
}

export const ADMINISTRATION_GATEWAY = new InjectionToken<AdministrationGateway>(
  'ADMINISTRATION_GATEWAY',
);

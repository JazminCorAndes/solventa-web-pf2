import { Injectable } from '@angular/core';
import { ReviewInput } from './administration.models';

export interface ReviewAttempt {
  key: string;
  input: ReviewInput;
}

@Injectable({ providedIn: 'root' })
export class ReviewAttemptsService {
  // Conserva una respuesta incierta al navegar, sin persistir motivos en el navegador.
  private readonly attempts = new Map<string, ReviewAttempt>();

  get(userId: string, claimId: string): ReviewAttempt | null {
    return this.attempts.get(this.scope(userId, claimId)) ?? null;
  }

  set(userId: string, claimId: string, attempt: ReviewAttempt): void {
    this.attempts.set(this.scope(userId, claimId), attempt);
  }

  clear(userId: string, claimId: string): void {
    this.attempts.delete(this.scope(userId, claimId));
  }

  private scope(userId: string, claimId: string): string {
    return JSON.stringify([userId, claimId.toLowerCase()]);
  }
}

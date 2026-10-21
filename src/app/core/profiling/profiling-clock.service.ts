import { Injectable } from '@angular/core';
import { ProfilingError } from './profiling.errors';

@Injectable({ providedIn: 'root' })
export class ProfilingClock {
  private anchor: { serverTime: number; earliestTime: number; monotonicTime: number } | null = null;

  synchronize(date: string | null, startedAt: number): void {
    const serverTime = date === null ? NaN : Date.parse(date);
    if (!Number.isFinite(serverTime)) {
      throw new ProfilingError('reloj_no_disponible');
    }
    const receivedAt = performance.now();
    // Date tiene precision de segundos. El limite superior evita prolongar la vigencia.
    this.anchor = {
      serverTime: serverTime + 1000 + Math.max(0, receivedAt - startedAt),
      earliestTime: serverTime,
      monotonicTime: receivedAt,
    };
  }

  now(): number {
    return this.anchor
      ? this.anchor.serverTime + performance.now() - this.anchor.monotonicTime
      : Date.now();
  }

  earliestNow(): number {
    // El limite inferior no solicita mas de 30 dias por la incertidumbre de Date/red.
    return this.anchor
      ? this.anchor.earliestTime + performance.now() - this.anchor.monotonicTime
      : Date.now();
  }
}

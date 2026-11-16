import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/** Native formatting/time parsing, with unambiguous numeric calendar input. */
@Injectable()
export class ClaimDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value !== 'string') return value instanceof Date ? value : null;
    if (!value.trim()) return null;
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
    if (!match) return this.invalid();
    const [, first, second, year] = match;
    const month = Number(this.locale.startsWith('en') ? first : second) - 1;
    const day = Number(this.locale.startsWith('en') ? second : first);
    try {
      return this.createDate(Number(year), month, day);
    } catch {
      return this.invalid();
    }
  }
}

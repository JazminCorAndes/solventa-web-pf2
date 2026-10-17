import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

@Injectable()
export class LocalizedDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (value instanceof Date) {
      return this.clone(value);
    }
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    const parts = iso ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
    if (!parts) {
      return this.invalid();
    }
    const english = String(this.locale).startsWith('en');
    const year = Number(parts[iso ? 1 : 3]);
    const month = Number(parts[iso ? 2 : english ? 1 : 2]);
    const day = Number(parts[iso ? 3 : english ? 2 : 1]);
    const result = new Date(year, month - 1, day);
    return result.getFullYear() === year &&
      result.getMonth() === month - 1 &&
      result.getDate() === day
      ? result
      : this.invalid();
  }
}

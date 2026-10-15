import { Directive, HostListener, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

export type InputFilter =
  'alphanumeric' | 'colombian-id' | 'colombian-phone' | 'digits' | 'vehicle-plate';

@Directive({
  selector: 'input[appInputFilter]',
})
export class InputFilterDirective {
  readonly appInputFilter = input.required<InputFilter>();
  private readonly control = inject(NgControl, { optional: true, self: true });

  @HostListener('input', ['$event.target'])
  filter(target: EventTarget | null): void {
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const filtered = filterInputValue(target.value, this.appInputFilter());
    if (filtered === target.value) {
      return;
    }

    const cursor = Math.min(target.selectionStart ?? filtered.length, filtered.length);
    target.value = filtered;
    this.control?.control?.setValue(filtered);
    target.setSelectionRange(cursor, cursor);
  }
}

export function filterInputValue(value: string, filter: InputFilter): string {
  if (filter === 'colombian-id') {
    return value.replace(/\D/g, '').slice(0, 10);
  }

  if (filter === 'colombian-phone') {
    const digits = value.replace(/\D/g, '');
    return (digits.startsWith('57') && digits.length > 10 ? digits.slice(2) : digits).slice(0, 10);
  }

  if (filter === 'digits') {
    return value.replace(/\D/g, '');
  }

  if (filter === 'alphanumeric') {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let plate = '';
  for (const character of normalized) {
    if (plate.length < 3 && /[A-Z]/.test(character)) {
      plate += character;
    } else if (plate.length >= 3 && plate.length < 6 && /[0-9]/.test(character)) {
      plate += character;
    }
  }
  return plate;
}

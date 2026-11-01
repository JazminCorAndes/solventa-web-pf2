import { ValidatorFn } from '@angular/forms';
import { DocumentType } from '../auth/auth.models';

const DOCUMENT_NUMBER_PATTERNS: Record<DocumentType, RegExp> = {
  cc: /^[0-9]{6,10}$/,
  ce: /^[0-9]{6,12}$/,
  passport: /^[A-Za-z0-9]{5,16}$/,
  ppt: /^[0-9]{7,10}$/,
};

/** Solo el pasaporte admite letras; los documentos colombianos son numéricos. */
export function documentNumberPattern(type: DocumentType): RegExp {
  return DOCUMENT_NUMBER_PATTERNS[type];
}

/** Valida el número según el tipo elegido en el control hermano `typeControl`. */
export function documentNumberValidator(typeControl: string): ValidatorFn {
  return (control) => {
    const type = control.parent?.get(typeControl)?.value as DocumentType | undefined;
    const value = String(control.value ?? '');
    if (!value || !type) return null;
    return documentNumberPattern(type).test(value) ? null : { pattern: true };
  };
}

export function documentNumberFilter(type: DocumentType): 'alphanumeric' | 'digits' {
  return type === 'passport' ? 'alphanumeric' : 'digits';
}

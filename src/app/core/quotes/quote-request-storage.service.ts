import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { QuoteRequestRecord } from './quote-request.models';

const QUOTE_REQUEST_KEY = 'solventa.quote.request';

export interface QuoteRequestStorage {
  read(): QuoteRequestRecord | null;
  write(request: QuoteRequestRecord): void;
  clear(): void;
}

export const QUOTE_REQUEST_STORAGE = new InjectionToken<QuoteRequestStorage>(
  'QUOTE_REQUEST_STORAGE',
);

@Injectable()
export class BrowserQuoteRequestStorage implements QuoteRequestStorage {
  private readonly storage = inject(DOCUMENT).defaultView?.sessionStorage;

  read(): QuoteRequestRecord | null {
    const value = this.storage?.getItem(QUOTE_REQUEST_KEY);
    if (!value) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(value);
      if (isQuoteRequestRecord(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Stored quote request could not be parsed.', error);
    }

    this.clear();
    return null;
  }

  write(request: QuoteRequestRecord): void {
    this.storage?.setItem(QUOTE_REQUEST_KEY, JSON.stringify(request));
  }

  clear(): void {
    this.storage?.removeItem(QUOTE_REQUEST_KEY);
  }
}

function isQuoteRequestRecord(value: unknown): value is QuoteRequestRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<QuoteRequestRecord>;
  return (
    typeof candidate.id === 'string' &&
    candidate.status === 'received' &&
    typeof candidate.productId === 'string' &&
    candidate.customerType === 'natural' &&
    isDocumentType(candidate.documentType) &&
    typeof candidate.nationalId === 'string' &&
    isProductData(candidate.productData) &&
    typeof candidate.email === 'string' &&
    typeof candidate.phone === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function isDocumentType(value: unknown): boolean {
  return value === 'cc' || value === 'ce' || value === 'passport' || value === 'ppt';
}

function isProductData(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

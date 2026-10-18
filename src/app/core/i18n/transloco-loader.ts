import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  getTranslation(lang: string): Observable<Translation> {
    const url = new URL(`assets/i18n/${lang}.json`, this.document.baseURI);
    return this.http.get<Translation>(url.href);
  }
}

import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it.each([
    {
      baseURI: 'http://localhost:4200/',
      expected: 'http://localhost:4200/assets/i18n/es.json',
      lang: 'es',
    },
    {
      baseURI: 'https://jazmincorandes.github.io/solventa-web-pf2/',
      expected: 'https://jazmincorandes.github.io/solventa-web-pf2/assets/i18n/en.json',
      lang: 'en',
    },
  ])('loads $lang relative to $baseURI', async ({ baseURI, expected, lang }) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DOCUMENT, useValue: { baseURI } },
      ],
    });
    const result = firstValueFrom(TestBed.inject(TranslocoHttpLoader).getTranslation(lang));
    const request = TestBed.inject(HttpTestingController).expectOne(expected);
    expect(request.request.withCredentials).toBe(false);
    request.flush({ common: { retry: 'Retry' } });
    await expect(result).resolves.toEqual({ common: { retry: 'Retry' } });
  });
});

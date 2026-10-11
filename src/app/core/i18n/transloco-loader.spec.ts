import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  it('loads translations relative to the application base path', async () => {
    TestBed.configureTestingModule({
      providers: [TranslocoHttpLoader, provideHttpClient(), provideHttpClientTesting()],
    });
    const loader = TestBed.inject(TranslocoHttpLoader);
    const http = TestBed.inject(HttpTestingController);
    const translation = firstValueFrom(loader.getTranslation('es'));
    const request = http.expectOne('assets/i18n/es.json');

    request.flush({ application: { title: 'Solventa' } });

    await expect(translation).resolves.toEqual({
      application: { title: 'Solventa' },
    });
    http.verify();
  });
});

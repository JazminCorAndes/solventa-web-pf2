import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { TestAuthGateway, TestAuthStorage } from '../../core/auth/auth.testing';
import { createConsent } from '../../core/profiling/profiling.fixtures';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { HttpProfilingGateway } from '../../data-access/profiling/http-profiling.gateway';

describe('Registration and consent through application routes', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const consentUrl = `${environment.apiBaseUrl}/v1/consentimientos/perfilamiento`;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_GATEWAY, useClass: TestAuthGateway },
        { provide: AUTH_STORAGE, useClass: TestAuthStorage },
        { provide: PROFILING_GATEWAY, useClass: HttpProfilingGateway },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it('requires login for consent and exposes registration preserving the return URL', async () => {
    await harness.navigateByUrl('/app/consentimiento');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/iniciar-sesion?returnUrl=%2Fapp%2Fconsentimiento');
    http.expectNone(consentUrl);
    const registration =
      harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href^="/registrarse"]');
    expect(registration?.getAttribute('href')).toBe(
      '/registrarse?returnUrl=%2Fapp%2Fconsentimiento',
    );
    await harness.navigateByUrl(registration!.getAttribute('href')!);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('#register-name')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('input[type=radio]:checked')).toBeNull();
  });

  it('uses the existing authenticated panel and only revokes after confirmation', async () => {
    await firstValueFrom(
      TestBed.inject(AuthService).login({ email: 'cliente@solventa.co', password: 'Test123!' }),
    );
    await harness.navigateByUrl('/app/consentimiento');
    const load = http.expectOne(consentUrl);
    expect(load.request.method).toBe('GET');
    expect(load.request.headers.get('Authorization')).toBe('Bearer access-1');
    const consent = createConsent();
    load.flush(consent, { headers: { Date: new Date().toUTCString() } });
    harness.detectChanges();
    const host = harness.routeNativeElement!;
    expect(host.querySelector('a[href="/app/consentimiento"]')).not.toBeNull();
    expect(host.querySelector('app-profiling-panel')).not.toBeNull();
    const click = (label: string) => {
      const buttons = Array.from(host.querySelectorAll('button'));
      const button = buttons.find((item) => item.textContent?.trim() === label);
      expect(button).toBeDefined();
      button!.click();
      harness.detectChanges();
    };
    click(es.profiling.revoke);
    http.expectNone(consentUrl);
    click(es.profiling.revocation.confirm);
    const revoke = http.expectOne(consentUrl);
    expect(revoke.request.method).toBe('PUT');
    expect(revoke.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(revoke.request.body).toEqual({ autorizado: false, version: consent.version });
    expect(host.textContent).not.toContain(es.profiling.consentStatus.revocado);
    revoke.flush(
      { ...consent, estado: 'revocado', version: consent.version + 1 },
      { headers: { Date: new Date().toUTCString() } },
    );
    harness.detectChanges();
    expect(host.textContent).toContain(es.profiling.consentStatus.revocado);
  });
});

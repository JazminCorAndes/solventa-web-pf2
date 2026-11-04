import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { CLAIM_STATUS_GATEWAY } from '../../core/claims/claim-status.gateway';
import {
  CLAIM_ID,
  CLAIM_NOT_FOUND_PROBLEM,
  CLAIM_STATUS_RESPONSE,
} from '../../core/claims/claim-status.testing';
import { HttpClaimStatusGateway } from '../../data-access/claims/http-claim-status.gateway';
import { ClaimStatusPageComponent } from './claim-status-page.component';

registerLocaleData(localeEsCo);
const URL = `${environment.apiBaseUrl}/v1/clientes/me/siniestros/${CLAIM_ID}`;

describe('ClaimStatusPageComponent with HTTP consumer', () => {
  let fixture: ComponentFixture<ClaimStatusPageComponent>;
  let http: HttpTestingController;
  let params: BehaviorSubject<ParamMap>;
  const user = signal<AuthUser | null>(TEST_USER);
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const find = (selector: string) => root().querySelector<HTMLElement>(selector);
  const render = () => fixture.detectChanges();

  async function setup(claimId: string | null): Promise<void> {
    params = new BehaviorSubject(convertToParamMap(claimId ? { claimId } : {}));
    await TestBed.configureTestingModule({
      imports: [
        ClaimStatusPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
        { provide: CLAIM_STATUS_GATEWAY, useClass: HttpClaimStatusGateway },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ClaimStatusPageComponent);
    http = TestBed.inject(HttpTestingController);
    render();
  }

  beforeEach(() => user.set(TEST_USER));

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows the current state, update date and allowed history from the backend', async () => {
    await setup(CLAIM_ID);
    expect(text()).toContain(es.claimStatus.loading);

    http.expectOne(URL).flush(CLAIM_STATUS_RESPONSE);
    render();

    expect(find('[data-testid="claim-summary"]')?.textContent).toContain(
      es.claimStatus.states.en_inspeccion,
    );
    expect(find('[data-testid="claim-updated-at"]')?.textContent?.trim()).not.toBe('');
    const history = root().querySelectorAll('[data-testid="claim-history-entry"]');
    expect(
      Array.from(history, (entry) => entry.querySelector('strong')?.textContent?.trim()),
    ).toEqual([
      es.claimStatus.states.reportado,
      es.claimStatus.states.en_evaluacion,
      es.claimStatus.states.en_inspeccion,
    ]);
    expect(history[2].classList).toContain('current');
    expect(text()).toContain(es.claimStatus.types.asistido);
  });

  it('shows unclassified and preserves access to the report form', async () => {
    await setup(CLAIM_ID);
    http.expectOne(URL).flush({ ...CLAIM_STATUS_RESPONSE, tipo: null });
    render();
    expect(text()).toContain(es.claimStatus.types.unclassified);
    expect(text()).not.toContain(es.claimStatus.types.asistido);
    expect(find('a[href="/app/siniestros/reportar"]')?.textContent).toContain(es.claims.title);
  });

  it('refreshes from the backend and never keeps the previous state after a failure', async () => {
    await setup(CLAIM_ID);
    http.expectOne(URL).flush(CLAIM_STATUS_RESPONSE);
    render();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    find('[data-testid="claim-refresh"]')?.click();
    render();
    expect(find('[data-testid="claim-summary"]')).toBeNull();
    expect(text()).toContain(es.claimStatus.loading);

    http.expectOne(URL).flush(
      { code: 'servicio_no_disponible' },
      {
        status: 503,
        statusText: 'Service Unavailable',
      },
    );
    render();

    expect(find('[data-testid="claim-error"]')?.textContent).toContain(es.claimStatus.error);
    expect(find('[data-testid="claim-summary"]')).toBeNull();
    expect(find('[data-testid="claim-history-entry"]')).toBeNull();

    find('[data-testid="claim-error"] button')?.click();
    http.expectOne(URL).flush(CLAIM_STATUS_RESPONSE);
    render();
    expect(find('[data-testid="claim-summary"]')).not.toBeNull();
  });

  it('reports an unavailable claim without revealing third party data', async () => {
    await setup(CLAIM_ID);
    http.expectOne(URL).flush(CLAIM_NOT_FOUND_PROBLEM, { status: 404, statusText: 'Not Found' });
    render();

    expect(find('[data-testid="claim-not-found"]')?.textContent).toContain(es.claimStatus.notFound);
    expect(find('[data-testid="claim-summary"]')).toBeNull();
  });

  it('treats a response outside the contract as an error, not as a valid state', async () => {
    await setup(CLAIM_ID);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(URL).flush({ ...CLAIM_STATUS_RESPONSE, estado: 'aprobado' });
    render();

    expect(find('[data-testid="claim-error"]')).not.toBeNull();
    expect(find('[data-testid="claim-summary"]')).toBeNull();
  });

  it('validates the claim number before navigating to it', async () => {
    await setup(null);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const input = find('[data-testid="claim-id-input"]') as HTMLInputElement;
    const form = root().querySelector('form') as HTMLFormElement;

    input.value = 'no-es-un-numero';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    render();
    expect(navigate).not.toHaveBeenCalled();
    expect(text()).toContain(es.claimStatus.lookupInvalid);

    input.value = ` ${CLAIM_ID} `;
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    expect(navigate).toHaveBeenCalledWith(['/app/siniestros', CLAIM_ID]);
  });

  it('does not query a malformed identifier coming from the URL', async () => {
    await setup('no-es-un-numero');
    expect(text()).toContain(es.claimStatus.lookupInvalid);
    http.expectNone(() => true);
  });
});

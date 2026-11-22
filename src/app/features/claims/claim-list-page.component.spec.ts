import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { CLAIM_GATEWAY } from '../../core/claims/claim.gateway';
import { CLAIM_EVIDENCE_GATEWAY } from '../../core/claims/claim-evidence.gateway';
import { CLAIM_STATUS_GATEWAY } from '../../core/claims/claim-status.gateway';
import { CLAIM_ID, CLAIM_STATUS_RESPONSE, POLICY_ID } from '../../core/claims/claim-status.testing';
import { ClaimRecord } from '../../core/claims/claim.models';
import { HttpClaimGateway } from '../../data-access/claims/http-claim.gateway';
import { HttpClaimStatusGateway } from '../../data-access/claims/http-claim-status.gateway';
import { HttpClaimEvidenceGateway } from '../../data-access/claims/http-claim-evidence.gateway';
import { ClaimListPageComponent } from './claim-list-page.component';
import { ClaimStatusPageComponent } from './claim-status-page.component';

registerLocaleData(localeEsCo);
const URL = `${environment.apiBaseUrl}/v1/siniestros`;
const record: ClaimRecord = {
  id: CLAIM_ID,
  polizaId: POLICY_ID,
  fechaEvento: '2026-11-01T13:00:00Z',
  registradoEn: '2026-11-01T15:00:00Z',
  estado: 'registrado',
  tipoEvento: 'Colision',
  descripcion: 'Descripcion sintetica del evento reportado.',
  lugar: 'Lugar sintetico',
};

describe('ClaimListPageComponent with HTTP and claim routes', () => {
  let harness: RouterTestingHarness;
  let component: ClaimListPageComponent;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(TEST_USER);
  const root = () => harness.routeNativeElement!;
  const text = () => root().textContent ?? '';
  const render = () => harness.detectChanges();

  beforeEach(async () => {
    user.set(TEST_USER);
    await TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'app', children: routes.find((route) => route.path === 'app')!.children },
        ]),
        { provide: AuthService, useValue: { user } },
        { provide: CLAIM_GATEWAY, useClass: HttpClaimGateway },
        { provide: CLAIM_STATUS_GATEWAY, useClass: HttpClaimStatusGateway },
        { provide: CLAIM_EVIDENCE_GATEWAY, useClass: HttpClaimEvidenceGateway },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl('/app/siniestros', ClaimListPageComponent);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('shows loading, report fields and receipt semantics without fabricating a current state', () => {
    expect(text()).toContain(es.claimList.loading);
    http.expectOne(URL).flush({ siniestros: [record] });
    render();
    expect(text()).toContain(record.tipoEvento);
    expect(text()).toContain(record.descripcion);
    expect(text()).toContain(record.lugar);
    expect(text()).toContain(record.polizaId);
    expect(text()).toContain(es.claimList.registered);
    expect(text()).toContain(es.claimList.registrationNote);
    expect(text()).not.toContain(es.claimStatus.states.en_evaluacion);
    expect(root().querySelector('[data-testid="claim-list-item"]')).not.toBeNull();
  });

  it('links list to the existing detail, history, evidence and back to a fresh list', async () => {
    http.expectOne(URL).flush({ siniestros: [record] });
    render();
    const href = root().querySelector<HTMLAnchorElement>(
      `a[href="/app/siniestros/${CLAIM_ID}"]`,
    )!.pathname;
    await harness.navigateByUrl(href, ClaimStatusPageComponent);
    http
      .expectOne(`${environment.apiBaseUrl}/v1/clientes/me/siniestros/${CLAIM_ID}`)
      .flush(CLAIM_STATUS_RESPONSE);
    render();
    expect(text()).toContain(es.claimStatus.states.en_inspeccion);
    expect(root().querySelectorAll('[data-testid="claim-history-entry"]')).toHaveLength(3);
    expect(root().querySelector('[data-testid="claim-evidence-panel"]')).not.toBeNull();
    expect(root().querySelector('a[href="/app/siniestros"]')?.textContent).toContain(
      es.claimList.back,
    );
    await harness.navigateByUrl('/app/siniestros', ClaimListPageComponent);
    http.expectOne(URL).flush({ siniestros: [] });
    render();
    expect(text()).toContain(es.claimList.empty);
    expect(root().querySelector('a[href="/app/siniestros/reportar"]')).not.toBeNull();
    const reportRoute = routes.find((route) => route.path === 'app')!.children!;
    expect(reportRoute.findIndex((route) => route.path === 'siniestros/reportar')).toBeLessThan(
      reportRoute.findIndex((route) => route.path === 'siniestros/:claimId'),
    );
  });

  it('translates empty state and keeps report action available', () => {
    http.expectOne(URL).flush({ siniestros: [] });
    TestBed.inject(TranslocoService).setActiveLang('en');
    render();
    expect(text()).toContain(en.claimList.empty);
    expect(text()).toContain(en.claims.title);
    expect(root().querySelector('[data-testid="claim-list-item"]')).toBeNull();
  });

  it('discards stale records on refresh, shows an explicit failure and can retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(URL).flush({ siniestros: [record] });
    component.refresh();
    render();
    expect(root().querySelector('[data-testid="claim-list-item"]')).toBeNull();
    http.expectOne(URL).flush({}, { status: 503, statusText: 'Unavailable' });
    render();
    expect(text()).toContain(es.claimList.error);
    expect(text()).not.toContain(es.claimList.empty);
    root().querySelector<HTMLButtonElement>('[data-testid="claim-list-error"] button')!.click();
    http.expectOne(URL).flush({ siniestros: [record] });
    render();
    expect(text()).toContain(record.tipoEvento);
  });

  it.each([401, 403])('shows %s as access failure, not empty or successful', (status) => {
    http.expectOne(URL).flush({}, { status, statusText: 'Denied' });
    render();
    expect(text()).toContain(status === 403 ? es.claimList.forbidden : es.claimList.session);
    expect(text()).not.toContain(es.claimList.empty);
    expect(root().querySelector('[data-testid="claim-list-item"]')).toBeNull();
  });

  it('cancels overlapping loads and hides all records immediately when the account changes', () => {
    const pending = http.expectOne(URL);
    component.refresh();
    expect(pending.cancelled).toBe(true);
    http.expectOne(URL).flush({ siniestros: [record] });
    expect(component.claims()).toHaveLength(1);
    user.set({ ...TEST_USER, id: 'another-client' });
    expect(component.claims()).toEqual([]);
    render();
    http.expectOne(URL).flush({ siniestros: [] });
    render();
    expect(text()).toContain(es.claimList.empty);
    expect(text()).not.toContain(record.descripcion);
  });

  it('cancels a pending list on logout without issuing anonymous requests', () => {
    const pending = http.expectOne(URL);
    user.set(null);
    render();
    expect(pending.cancelled).toBe(true);
    http.expectNone(URL);
    expect(component.claims()).toEqual([]);
    expect(text()).toContain(es.claimList.session);
  });

  it('retains optional UUID lookup and rejects invalid input without navigation', () => {
    http.expectOne(URL).flush({ siniestros: [] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.lookup.setValue('not-a-uuid');
    component.search();
    expect(component.lookup.touched).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    component.lookup.setValue(` ${CLAIM_ID} `);
    component.search();
    expect(navigate).toHaveBeenCalledWith(['/app/siniestros', CLAIM_ID]);
    http.expectNone(URL);
  });
});

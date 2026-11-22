import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import localeEsCo from '@angular/common/locales/es-CO';
import { convertToParamMap, ActivatedRoute, provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { DASHBOARD_SNAPSHOT } from '../../core/dashboard/dashboard.testing';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { PolicyDetailPageComponent } from './policy-detail-page.component';
import { PolicyListPageComponent } from './policy-list-page.component';
import { PolicyDocumentPanelComponent } from './policy-document-panel.component';

registerLocaleData(localeEsCo);

describe('Policy pages', () => {
  const status = signal<'ready'>('ready');
  const snapshot = signal(DASHBOARD_SNAPSHOT);
  const dashboard = { status, snapshot, load: vi.fn() };
  const params = new BehaviorSubject(convertToParamMap({ policyId: '' }));

  beforeEach(() => {
    dashboard.load.mockClear();
    snapshot.set(DASHBOARD_SNAPSHOT);
  });

  it('shows issued policies in a dedicated section', async () => {
    await configure(PolicyListPageComponent);
    const fixture = TestBed.createComponent(PolicyListPageComponent);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('[data-testid="policy-card"]');
    expect(card.textContent).toContain(es.dashboard.policyTypes.travel);
    expect(card.textContent).toContain(es.policies.states.active);
    expect(card.querySelector('a').getAttribute('href')).toBe(
      `/app/polizas/${DASHBOARD_SNAPSHOT.policies[0].id}`,
    );
    expect(dashboard.load).toHaveBeenCalledOnce();
  });

  it('connects an active policy detail with claims, renewal, modification and cancellation', async () => {
    await configure(PolicyDetailPageComponent, DASHBOARD_SNAPSHOT.policies[0].id);
    const fixture = TestBed.createComponent(PolicyDetailPageComponent);
    fixture.detectChanges();

    expect(text(fixture)).toContain(es.policies.coverage);
    expect(text(fixture)).toContain(DASHBOARD_SNAPSHOT.policies[0].subscriptionId);
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.actions-card nav a'),
      (element: Element) => element.getAttribute('href'),
    );
    expect(links).toEqual([
      `/app/siniestros/reportar?polizaId=${DASHBOARD_SNAPSHOT.policies[0].id}`,
      `/app/polizas/${DASHBOARD_SNAPSHOT.policies[0].id}/renovacion`,
      `/app/polizas/${DASHBOARD_SNAPSHOT.policies[0].id}/modificacion`,
      `/app/polizas/${DASHBOARD_SNAPSHOT.policies[0].id}/cancelacion`,
    ]);
  });

  it('shows the recorded cancellation without offering renewal or modification', async () => {
    snapshot.set({
      ...DASHBOARD_SNAPSHOT,
      policies: [{ ...DASHBOARD_SNAPSHOT.policies[0], status: 'cancelada' }],
    });
    await configure(PolicyDetailPageComponent, DASHBOARD_SNAPSHOT.policies[0].id);
    const fixture = TestBed.createComponent(PolicyDetailPageComponent);
    fixture.detectChanges();
    expect(text(fixture)).toContain(es.policies.states.cancelled);
    expect(fixture.nativeElement.querySelector('.actions-card nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.actions-card a').getAttribute('href')).toBe(
      `/app/polizas/${DASHBOARD_SNAPSHOT.policies[0].id}/cancelacion`,
    );
  });

  it('does not present operations for an unknown policy', async () => {
    await configure(PolicyDetailPageComponent, 'missing-policy');
    const fixture = TestBed.createComponent(PolicyDetailPageComponent);
    fixture.detectChanges();

    expect(text(fixture)).toContain(es.policies.notFound);
    expect(fixture.nativeElement.querySelector('.actions-card')).toBeNull();
  });

  it('updates the document and actions when the router reuses the policy detail', async () => {
    const first = DASHBOARD_SNAPSHOT.policies[0];
    const second = { ...first, id: '80000000-0000-4000-8000-000000000002', status: 'cancelada' };
    snapshot.set({ ...DASHBOARD_SNAPSHOT, policies: [first, second] });
    await configure(PolicyDetailPageComponent, first.id, true);
    const harness = await RouterTestingHarness.create();
    const firstInstance = await harness.navigateByUrl(
      `/app/polizas/${first.id}`,
      PolicyDetailPageComponent,
    );
    const secondInstance = await harness.navigateByUrl(
      `/app/polizas/${second.id}`,
      PolicyDetailPageComponent,
    );
    harness.detectChanges();

    expect(secondInstance).toBe(firstInstance);
    expect(secondInstance.policy()).toEqual(second);
    expect(harness.routeNativeElement?.querySelector('.hero-copy')?.textContent).toContain(
      second.id,
    );
    expect(harness.routeNativeElement?.querySelector('.actions-card nav')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.actions-card a')?.getAttribute('href')).toBe(
      `/app/polizas/${second.id}/cancelacion`,
    );
    const documentPanel = harness.routeDebugElement?.query(
      By.directive(PolicyDocumentPanelComponent),
    );
    expect(documentPanel?.componentInstance.policy()).toEqual(second);

    await harness.navigateByUrl('/app/polizas/missing-policy', PolicyDetailPageComponent);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain(es.policies.notFound);
    expect(harness.routeNativeElement?.querySelector('app-policy-document-panel')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('.actions-card')).toBeNull();
  });

  async function configure(
    component: typeof PolicyListPageComponent | typeof PolicyDetailPageComponent,
    policyId = '',
    realRoute = false,
  ): Promise<void> {
    params.next(convertToParamMap({ policyId }));
    await TestBed.configureTestingModule({
      imports: [
        component,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideHttpClient(),
        { provide: AuthService, useValue: { user: signal(null) } },
        provideRouter(
          realRoute
            ? [{ path: 'app/polizas/:policyId', component: PolicyDetailPageComponent }]
            : [],
        ),
        { provide: DashboardService, useValue: dashboard },
        ...(!realRoute
          ? [
              {
                provide: ActivatedRoute,
                useValue: {
                  paramMap: params.asObservable(),
                  snapshot: { paramMap: convertToParamMap({ policyId }) },
                },
              },
            ]
          : []),
      ],
    }).compileComponents();
  }

  function text(fixture: ComponentFixture<unknown>): string {
    return fixture.nativeElement.textContent ?? '';
  }
});

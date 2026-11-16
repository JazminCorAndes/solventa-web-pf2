import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { convertToParamMap, ActivatedRoute, provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { DASHBOARD_SNAPSHOT } from '../../core/dashboard/dashboard.testing';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { PolicyDetailPageComponent } from './policy-detail-page.component';
import { PolicyListPageComponent } from './policy-list-page.component';

registerLocaleData(localeEsCo);

describe('Policy pages', () => {
  const status = signal<'ready'>('ready');
  const snapshot = signal(DASHBOARD_SNAPSHOT);
  const dashboard = { status, snapshot, load: vi.fn() };

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

  it('connects an active policy detail with claims, renewal and modification', async () => {
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
    ]);
  });

  it('does not present operations for an unknown policy', async () => {
    await configure(PolicyDetailPageComponent, 'missing-policy');
    const fixture = TestBed.createComponent(PolicyDetailPageComponent);
    fixture.detectChanges();

    expect(text(fixture)).toContain(es.policies.notFound);
    expect(fixture.nativeElement.querySelector('.actions-card')).toBeNull();
  });

  async function configure(
    component: typeof PolicyListPageComponent | typeof PolicyDetailPageComponent,
    policyId = '',
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [
        component,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: DashboardService, useValue: dashboard },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ policyId }) } },
        },
      ],
    }).compileComponents();
  }

  function text(fixture: ComponentFixture<unknown>): string {
    return fixture.nativeElement.textContent ?? '';
  }
});

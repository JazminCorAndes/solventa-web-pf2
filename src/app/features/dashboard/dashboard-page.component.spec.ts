import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { DASHBOARD_GATEWAY } from '../../core/dashboard/dashboard.gateway';
import { DASHBOARD_RESPONSE } from '../../core/dashboard/dashboard.testing';
import { HttpDashboardGateway } from '../../data-access/dashboard/http-dashboard.gateway';
import populatedReal from '../../data-access/dashboard/testing/dashboard-populated-real.json';
import emptyReal from '../../data-access/dashboard/testing/dashboard-empty-real.json';
import policyIntegration from '../../data-access/dashboard/testing/dashboard-policies-integration.json';
import { DashboardPageComponent } from './dashboard-page.component';

registerLocaleData(localeEsCo);
const URL = `${environment.apiBaseUrl}/v1/clientes/me/dashboard`;

describe('DashboardPageComponent with HTTP consumer', () => {
  let fixture: ComponentFixture<DashboardPageComponent>;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(TEST_USER);
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const elements = (selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector);

  beforeEach(async () => {
    user.set(TEST_USER);
    await TestBed.configureTestingModule({
      imports: [
        DashboardPageComponent,
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
        { provide: DASHBOARD_GATEWAY, useClass: HttpDashboardGateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardPageComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('renders persisted policies with their coverage dates and originating subscription', () => {
    expect(text()).toContain(es.dashboard.loading);
    http.expectOne(URL).flush(DASHBOARD_RESPONSE);
    fixture.detectChanges();
    expect(elements('[data-testid="dashboard-quote"]')).toHaveLength(1);
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(1);
    expect(elements('[data-testid="dashboard-subscription"]')).toHaveLength(0);
    expect(elements('[data-testid="dashboard-payment"]')).toHaveLength(1);
    expect(text()).toContain('12345.67 COP');
    expect(text()).toContain(es.offers.premiumLabels.por_viaje);
    expect(text()).toContain(es.dashboard.estimatedPremium);
    expect(text()).toContain(es.dashboard.states.calculated);
    const policyText = elements('[data-testid="dashboard-policy"]')[0].textContent ?? '';
    expect(policyText).toContain(DASHBOARD_RESPONSE.polizas[0].id);
    expect(policyText).toContain(DASHBOARD_RESPONSE.polizas[0].suscripcionId);
    expect(policyText).toContain(es.dashboard.policyTypes.travel);
    expect(policyText).toContain(es.dashboard.academicPolicy);
    expect(policyText).toContain(es.dashboard.states.active);
    expect(policyText).toContain('10/10/2026');
    expect(policyText).toContain('20/10/2026');
    expect(policyText).toContain(es.dashboard.startDate);
    expect(policyText).toContain(es.dashboard.endDate);
    expect(text()).toContain(es.dashboard.policies);
    expect(text()).not.toContain('Funciones no disponibles');
    expect(text()).not.toContain('Notificaciones');
    expect(text()).toContain(es.dashboard.simulationNotice);
    expect(elements('a')).toHaveLength(1);
    expect(elements('a')[0].getAttribute('href')).toBe('/app/cotizaciones/solicitar');
    expect(text()).not.toContain('Madrid');
  });

  it('shows valid empty policies without presenting subscriptions as policies', () => {
    http.expectOne(URL).flush({
      ...DASHBOARD_RESPONSE,
      cotizaciones: [],
      suscripciones: [],
      pagos: [],
      polizas: [],
    });
    fixture.detectChanges();
    expect(text()).toContain(es.dashboard.emptyQuotes);
    expect(text()).toContain(es.dashboard.emptyPolicies);
    expect(text()).toContain(es.dashboard.emptyPayments);
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(0);
    expect(elements('[role="alert"]')).toHaveLength(0);
  });

  it('counts only policies and preserves unknown policy types and states literally', () => {
    http.expectOne(URL).flush({
      ...DASHBOARD_RESPONSE,
      suscripciones: [],
      polizas: [
        DASHBOARD_RESPONSE.polizas[0],
        { ...DASHBOARD_RESPONSE.polizas[0], id: 'policy-002', tipo: 'futuro', estado: 'FUTURA' },
      ],
    });
    fixture.detectChanges();
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(2);
    expect(elements('.metric-grid mat-card')[1].textContent).toContain('2');
    expect(text()).toContain('futuro');
    expect(text()).toContain('FUTURA');
  });

  it.each(['programada', 'vigente', 'vencida'] as const)(
    'translates the persisted %s policy state without deriving it from dates',
    (estado) => {
      http.expectOne(URL).flush({
        ...DASHBOARD_RESPONSE,
        polizas: [{ ...DASHBOARD_RESPONSE.polizas[0], estado }],
      });
      fixture.detectChanges();
      const states = {
        programada: es.dashboard.states.scheduled,
        vigente: es.dashboard.states.active,
        vencida: es.dashboard.states.expired,
      };
      expect(elements('[data-testid="dashboard-policy"]')[0].textContent).toContain(states[estado]);
    },
  );

  it('rejects the legacy populated BFF response rather than inventing policies', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(URL).flush(populatedReal);
    fixture.detectChanges();
    expect(elements('[role="alert"]')).toHaveLength(1);
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(0);
  });

  it('renders the captured persisted policy through the HTTP consumer without shifting coverage dates', () => {
    http.expectOne(URL).flush(policyIntegration.populated);
    fixture.detectChanges();
    const policies = elements('[data-testid="dashboard-policy"]');
    expect(policies).toHaveLength(1);
    const policyText = policies[0].textContent ?? '';
    expect(policyText).toContain(policyIntegration.populated.polizas[0].id);
    expect(policyText).toContain(policyIntegration.populated.polizas[0].suscripcionId);
    expect(policyText).toContain(es.dashboard.policyTypes.automotive);
    expect(policyText).toContain(es.dashboard.states.active);
    expect(policyText).toContain('19/10/2026');
    expect(policyText).toContain('19/11/2026');
    expect(policyText).toContain(es.dashboard.academicPolicy);
    expect(elements('[data-testid="dashboard-payment"]')).toHaveLength(1);
    expect(elements('[role="alert"]')).toHaveLength(0);
  });

  it('renders the captured empty policy account as empty, not unavailable', () => {
    http.expectOne(URL).flush(policyIntegration.empty);
    fixture.detectChanges();
    expect(text()).toContain(es.dashboard.emptyPolicies);
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(0);
    expect(elements('[role="alert"]')).toHaveLength(0);
  });

  it('does not treat legacy unavailable policies as a valid empty account', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(URL).flush(emptyReal);
    fixture.detectChanges();
    expect(text()).toContain(es.dashboard.error);
    expect(text()).not.toContain(es.dashboard.emptyPolicies);
    expect(elements('[role="alert"]')).toHaveLength(1);
  });

  it('renders an HTTP failure as an error, not an empty account, and retries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(URL).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain(es.dashboard.error);
    expect(text()).not.toContain(es.dashboard.emptyQuotes);
    const retry = elements('[role="alert"] button')[0] as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    http.expectOne(URL).flush(DASHBOARD_RESPONSE);
    fixture.detectChanges();
    expect(elements('[data-testid="dashboard-payment"]')).toHaveLength(1);
  });

  it('keeps unknown persisted states literal and does not turn an issued saga into a policy', () => {
    http.expectOne(URL).flush({
      ...DASHBOARD_RESPONSE,
      polizas: [],
      cotizaciones: [{ ...DASHBOARD_RESPONSE.cotizaciones[0], estado: 'FUTURO' }],
      suscripciones: [
        {
          ...DASHBOARD_RESPONSE.suscripciones[0],
          saga: { ...DASHBOARD_RESPONSE.suscripciones[0].saga, estado: 'emitida' },
        },
      ],
    });
    fixture.detectChanges();
    expect(text()).toContain('FUTURO');
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(0);
    expect(text()).toContain(es.dashboard.emptyPolicies);
  });

  it('preserves unlike currencies and periodicities as separate records without totals', () => {
    http.expectOne(URL).flush({
      ...DASHBOARD_RESPONSE,
      pagos: [
        DASHBOARD_RESPONSE.pagos[0],
        {
          ...DASHBOARD_RESPONSE.pagos[0],
          id: 'payment-002',
          importe: { monto: '25.10', moneda: 'USD' },
          periodicidad: 'mensual',
        },
      ],
    });
    fixture.detectChanges();
    expect(elements('[data-testid="dashboard-payment"]')).toHaveLength(2);
    expect(text()).toContain('12345.67 COP');
    expect(text()).toContain('25.10 USD');
    expect(text()).toContain(es.offers.premiumLabels.mensual);
    expect(text()).not.toContain('12370.77');
  });

  it('uses English labels and removes the previous account data on logout', () => {
    TestBed.inject(TranslocoService).setActiveLang('en');
    http.expectOne(URL).flush(DASHBOARD_RESPONSE);
    fixture.detectChanges();
    expect(text()).toContain(en.dashboard.payments);
    expect(text()).toContain(en.dashboard.states.calculated);
    expect(text()).toContain(en.dashboard.policies);
    expect(text()).toContain(en.dashboard.startDate);
    expect(text()).toContain('Oct 10, 2026');
    expect(text()).toContain(en.dashboard.simulationNotice);
    user.set(null);
    fixture.detectChanges();
    expect(elements('[data-testid="dashboard-quote"]')).toHaveLength(0);
    expect(elements('[data-testid="dashboard-policy"]')).toHaveLength(0);
    expect(text()).not.toContain('12345.67');
  });
});

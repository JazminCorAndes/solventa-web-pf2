import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../public/assets/i18n/en.json';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardPolicy } from '../../core/dashboard/dashboard.models';
import {
  ACCEPTED_DOCUMENT,
  DOCUMENT_ACTOR_ID,
  DOCUMENT_POLICY_ID,
  POLICY_DOCUMENT,
} from '../../core/policies/policy-document.testing';
import { PolicyDocument } from '../../core/policies/policy-document.models';
import { PolicyDocumentPanelComponent } from './policy-document-panel.component';

registerLocaleData(localeEsCo);
const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${DOCUMENT_POLICY_ID}`;
const POLICY: DashboardPolicy = {
  id: DOCUMENT_POLICY_ID,
  subscriptionId: POLICY_DOCUMENT.contenido.suscripcionId,
  type: 'travel',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  status: 'vigente',
  simulated: true,
};

describe('PolicyDocumentPanelComponent', () => {
  let fixture: ComponentFixture<PolicyDocumentPanelComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [
        PolicyDocumentPanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { user: signal({ id: DOCUMENT_ACTOR_ID, role: 'client' }) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PolicyDocumentPanelComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('policy', POLICY);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function show(document: PolicyDocument = POLICY_DOCUMENT): HTMLElement {
    fixture.detectChanges();
    http.expectOne(`${BASE}/documento`).flush(document);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows authoritative premium, period, coverages and simulation without executing server text', () => {
    const root = show({
      ...POLICY_DOCUMENT,
      contenido: {
        ...POLICY_DOCUMENT.contenido,
        condiciones: ['<img src=x onerror="globalThis.executed=true">'],
      },
    });
    expect(root.textContent).toContain(es.policyDocument.simulation);
    expect(root.textContent).not.toContain('Documento académico. No es una póliza legal');
    expect(root.textContent).not.toContain(es.policyDocument.consent);
    expect(root.textContent).toContain('139.900');
    expect(root.textContent).toContain('noviembre');
    expect(root.textContent).toContain('Asistencia académica');
    expect(root.textContent).toContain('<img src=x');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('.download-document')?.textContent).toContain(
      es.policyDocument.download,
    );
  });

  it.each([POLICY_DOCUMENT, ACCEPTED_DOCUMENT])(
    'keeps the document and download without signature controls or acceptance history',
    (document) => {
      const root = show(document);
      expect(root.querySelector('mat-checkbox, .acceptance, details')).toBeNull();
      expect(root.textContent).not.toContain(es.policyDocument.acceptanceTitle);
      expect(root.querySelector('.accept-document')).toBeNull();
      expect(root.querySelector('.recover-acceptance')).toBeNull();
      expect(root.querySelector('.download-document')).not.toBeNull();
      http.expectNone(`${BASE}/aceptaciones`);
    },
  );

  it('does not fabricate a missing premium from the policy summary', () => {
    const root = show({
      ...POLICY_DOCUMENT,
      contenido: { ...POLICY_DOCUMENT.contenido, prima: null },
    });
    expect(root.textContent).toContain(es.policyDocument.unavailable);
    expect(root.textContent).not.toContain('139.900');
  });

  it('rejects missing authoritative coverages instead of fabricating them', () => {
    const root = show({
      ...POLICY_DOCUMENT,
      contenido: { ...POLICY_DOCUMENT.contenido, coberturas: [] },
    });
    expect(root.textContent).toContain(es.policyDocument.errors.invalid);
    expect(root.querySelector('.accept-document')).toBeNull();
  });

  it('preserves the service integer premium without floating point rounding', () => {
    const root = show({
      ...POLICY_DOCUMENT,
      contenido: {
        ...POLICY_DOCUMENT.contenido,
        prima: { monto: '9007199254740993', moneda: 'COP', periodicidad: 'mensual' },
      },
    });
    expect(root.textContent).toContain('9.007.199.254.740.993');
  });

  it('makes summary/document differences visible without replacing authoritative values', () => {
    fixture.componentRef.setInput('policy', { ...POLICY, endDate: '2026-12-30' });
    const root = show();
    expect(root.textContent).toContain(es.policyDocument.summaryDiffers);
    expect(root.textContent).toContain('30 de noviembre');
  });

  it('shows ownership errors with no acceptance or download action', () => {
    fixture.detectChanges();
    http
      .expectOne(`${BASE}/documento`)
      .flush({ code: 'poliza_no_encontrada' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      es.policyDocument.errors.notFound,
    );
    expect(root.querySelector('.accept-document')).toBeNull();
    expect(root.querySelector('.download-document')).toBeNull();
  });

  it('renders all document controls in English when selected', () => {
    TestBed.inject(TranslocoService).setActiveLang('en');
    const root = show();
    expect(root.textContent).toContain(en.policyDocument.title);
    expect(root.textContent).not.toContain(en.policyDocument.consent);
    expect(root.textContent).toContain(en.policyDocument.download);
    expect(root.textContent).not.toContain('policyDocument.');
  });
});

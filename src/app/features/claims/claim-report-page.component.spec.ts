import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER } from '../../core/auth/auth.testing';
import { ClaimRecord } from '../../core/claims/claim.models';
import { CLAIM_GATEWAY } from '../../core/claims/claim.gateway';
import { HttpClaimGateway } from '../../data-access/claims/http-claim.gateway';
import { ClaimReportPageComponent } from './claim-report-page.component';

const policy = {
  id: '11111111-1111-4111-8111-111111111111',
  tipo: 'automotive',
  fechaInicio: '2020-01-01',
  fechaFin: '2099-12-31',
  estado: 'vigente',
};
const url = `${environment.apiBaseUrl}/v1/siniestros`;
registerLocaleData(localeEsCo);
const fields = {
  polizaId: policy.id,
  fechaEvento: '2025-01-10T12:00',
  tipoEvento: ' Colision ',
  descripcion: ' Descripcion sintetica del evento ',
  lugar: ' Bogota ',
};

describe('ClaimReportPageComponent with authenticated HTTP', () => {
  let fixture: ComponentFixture<ClaimReportPageComponent>;
  let http: HttpTestingController;
  const user = signal<AuthUser | null>(TEST_USER);
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    sessionStorage.clear();
    user.set(TEST_USER);
    await TestBed.configureTestingModule({
      imports: [
        ClaimReportPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: {
            availableLangs: ['es', 'en'],
            defaultLang: 'es',
            reRenderOnLangChange: true,
          },
        }),
      ],
      providers: [
        { provide: CLAIM_GATEWAY, useClass: HttpClaimGateway },
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user, getAccessToken: () => of('synthetic-access') } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClaimReportPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function loadPolicies(policies = [policy]) {
    http.expectOne(`${url}/polizas`).flush({ polizas: policies });
    fixture.detectChanges();
  }

  function submit() {
    fixture.componentInstance.form.setValue(fields);
    fixture.componentInstance.submit();
  }

  it('validates required fields, trimmed length and event coverage without POST', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    component.submit();
    expect(component.form.controls.polizaId.touched).toBe(true);
    expect(component.form.invalid).toBe(true);
    for (const invalid of [
      { ...fields, fechaEvento: '2099-01-10T12:00' },
      { ...fields, fechaEvento: '2019-01-10T12:00' },
      { ...fields, descripcion: '         a ' },
      { ...fields, tipoEvento: '   ' },
      { ...fields, lugar: '' },
    ]) {
      component.form.setValue(invalid);
      component.submit();
      expect(component.form.invalid).toBe(true);
    }
    http.expectNone(url);
    fixture.detectChanges();
    expect(text()).not.toContain(es.claims.confirmed);
  });

  it('shows an explicit empty state with no available policy', () => {
    loadPolicies([]);
    fixture.detectChanges();
    expect(text()).toContain(es.claims.emptyPolicies);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
  });

  it('shows a policy failure and permits a fresh authenticated read', () => {
    http.expectOne(`${url}/polizas`).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain(es.claims.errors.policies);
    fixture.componentInstance.claims.loadPolicies();
    loadPolicies();
    expect(fixture.componentInstance.claims.policyError()).toBeNull();
  });

  it('prevents double clicks and shows only a real validated ID/status', () => {
    loadPolicies();
    submit();
    fixture.componentInstance.submit();
    const request = http.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-access');
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
    expect(request.request.body).toEqual({
      polizaId: policy.id,
      fechaEvento: new Date(fields.fechaEvento).toISOString(),
      tipoEvento: 'Colision',
      descripcion: 'Descripcion sintetica del evento',
      lugar: 'Bogota',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.disabled).toBe(true);
    expect(text()).not.toContain(es.claims.confirmed);
    const record: ClaimRecord = {
      ...request.request.body,
      id: '22222222-2222-4222-8222-222222222222',
      estado: 'registrado',
      registradoEn: '2025-01-10T18:00:00Z',
    };
    request.flush(record, { status: 201, statusText: 'Created' });
    fixture.detectChanges();
    expect(text()).toContain(es.claims.confirmed);
    expect(text()).toContain(record.id);
    expect(text()).toContain('registrado');
    expect(text()).toContain(es.claims.title);
    expect(
      fixture.nativeElement.querySelector(`a[href="/app/siniestros/${record.id}"]`)?.textContent,
    ).toContain(es.claimStatus.title);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('preserves the original payload/key after 503 and reload, regardless of changed input', () => {
    loadPolicies();
    submit();
    const request = http.expectOne(url);
    const key = request.request.headers.get('Idempotency-Key');
    const body = request.request.body;
    request.flush({ code: 'servicio_no_disponible' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain(es.claims.errors.unconfirmed);
    expect(fixture.componentInstance.form.disabled).toBe(true);
    fixture.destroy();
    fixture = TestBed.createComponent(ClaimReportPageComponent);
    fixture.detectChanges();
    loadPolicies([]);
    fixture.componentInstance.form.patchValue({ descripcion: 'Cambios ignorados del intento' });
    fixture.componentInstance.claims.retry();
    const replay = http.expectOne(url);
    expect(replay.request.body).toEqual(body);
    expect(replay.request.headers.get('Idempotency-Key')).toBe(key);
    replay.flush(
      {
        ...body,
        id: '22222222-2222-4222-8222-222222222222',
        estado: 'registrado',
        registradoEn: '2025-01-10T18:00:00Z',
      },
      { status: 200, statusText: 'OK' },
    );
    fixture.detectChanges();
    expect(text()).toContain(es.claims.confirmed);
  });

  it('keeps form data editable after a definitive validation rejection', () => {
    loadPolicies();
    submit();
    http
      .expectOne(url)
      .flush({ code: 'evento_fuera_vigencia' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(text()).toContain(es.claims.errors.invalid);
    expect(fixture.componentInstance.form.enabled).toBe(true);
    expect(fixture.componentInstance.form.controls.descripcion.value).toBe(fields.descripcion);
    expect(fixture.componentInstance.claims.record()).toBeNull();
  });

  it('does not present malformed responses as a successful report', () => {
    loadPolicies();
    submit();
    http.expectOne(url).flush({ estado: 'registrado' });
    fixture.detectChanges();
    expect(text()).not.toContain(es.claims.confirmed);
    expect(fixture.componentInstance.claims.attempt()).not.toBeNull();
    expect(fixture.componentInstance.form.disabled).toBe(true);
  });

  it('clears fields when the authenticated owner changes', () => {
    loadPolicies();
    fixture.componentInstance.form.setValue(fields);
    user.set({ ...TEST_USER, id: 'different-client' });
    fixture.detectChanges();
    expect(fixture.componentInstance.form.controls.descripcion.value).toBe('');
    expect(fixture.componentInstance.claims.policies()).toEqual([]);
  });

  it('uses the existing English language switch', () => {
    loadPolicies();
    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    expect(text()).toContain(en.claims.title);
    expect(text()).toContain(en.claims.instructions);
  });
});
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';

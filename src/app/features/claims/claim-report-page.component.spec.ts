import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ANIMATION_MODULE_TYPE, signal } from '@angular/core';
import { DateAdapter } from '@angular/material/core';
import { MatDatepicker } from '@angular/material/datepicker';
import { MatTimepicker } from '@angular/material/timepicker';
import { MatSelect } from '@angular/material/select';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
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
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import { HttpQuoteRequestGateway } from '../../data-access/quotes/http-quote-request.gateway';

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
const duplicatePolicy = { ...policy, id: '33333333-3333-4333-8333-333333333333' };

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
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        { provide: CLAIM_GATEWAY, useClass: HttpClaimGateway },
        { provide: QUOTE_REQUEST_GATEWAY, useClass: HttpQuoteRequestGateway },
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user, getAccessToken: () => of('synthetic-access') } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ClaimReportPageComponent);
    fixture.detectChanges();
    loadCatalog();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function loadPolicies(policies = [policy]) {
    http.expectOne(`${url}/polizas`).flush({ polizas: policies });
    fixture.detectChanges();
  }

  function loadCatalog(
    products = [
      {
        id: 'automotive',
        nombre: 'Seguro Automotriz Total',
        descripcion: 'Seguro de prueba',
        disponible: true,
        coberturasPrincipales: [],
      },
    ],
  ) {
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`).flush({ productos: products });
    fixture.detectChanges();
  }

  function submit() {
    fixture.componentInstance.form.setValue(fields);
    fixture.componentInstance.eventDay.setValue(new Date(fields.fechaEvento));
    fixture.componentInstance.eventTime.setValue(new Date(fields.fechaEvento));
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
    loadCatalog();
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
    loadCatalog();
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

  it('initializes once with the local clock and preserves edited time through date and policy refresh', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    expect(
      Math.abs(Date.parse(component.form.controls.fechaEvento.value) - Date.now()),
    ).toBeLessThan(5000);
    component.eventTime.setValue(new Date(2025, 0, 10, 12, 17));
    component.eventDay.setValue(new Date(2025, 0, 11));
    expect(new Date(component.form.controls.fechaEvento.value).getMinutes()).toBe(17);
    expect(new Date(component.form.controls.fechaEvento.value).getDate()).toBe(11);
    const timestamp = component.form.controls.fechaEvento.value;
    component.claims.loadPolicies();
    loadPolicies();
    expect(component.form.controls.fechaEvento.value).toBe(timestamp);
    expect(component.eventTime.value?.getMinutes()).toBe(17);
  });

  it('keeps the unique catalog label unchanged and permits policies with identical type and dates', () => {
    loadPolicies();
    expect(fixture.componentInstance.policyLabel(policy.id)).toBe(
      'Seguro Automotriz Total · 01/01/2020 – 31/12/2099',
    );
    expect(fixture.componentInstance.policyLabel(policy.id)).not.toContain(policy.id);
    expect(
      fixture.nativeElement.querySelector('[data-testid=policy-presentation-help]'),
    ).toBeNull();
    fixture.componentInstance.claims.loadPolicies();
    loadPolicies([policy, duplicatePolicy]);
    expect(text()).not.toContain(es.claims.ambiguousPolicy);
    expect(fixture.componentInstance.policyOptions.map((item) => item.selectable)).toEqual([
      true,
      true,
    ]);
    fixture.componentInstance.form.setValue(fields);
    expect(fixture.componentInstance.form.hasError('policyIdentity')).toBe(false);
    expect(fixture.componentInstance.form.valid).toBe(true);
    http.expectNone(url);
  });

  it.each([
    ['es', policy.id, 1],
    ['es', duplicatePolicy.id, 2],
    ['en', policy.id, 1],
    ['en', duplicatePolicy.id, 2],
  ] as const)(
    'selects either enabled duplicate DOM option in %s and sends exact ID %s (ordinal %s) to an isolated double',
    async (lang, id, ordinal) => {
      loadPolicies([duplicatePolicy, policy]);
      TestBed.inject(TranslocoService).setActiveLang(lang);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const report = vi.spyOn(component.claims, 'report').mockImplementation(() => undefined);
      component.form.setValue({ ...fields, polizaId: '' });
      const eventDate = new Date(2025, 0, 10, 12, 17);
      component.eventDay.setValue(eventDate);
      component.eventTime.setValue(eventDate);
      fixture.detectChanges();
      const select = fixture.debugElement
        .query(By.css('mat-select[formcontrolname=polizaId]'))
        .injector.get(MatSelect);
      select.open();
      fixture.detectChanges();
      await fixture.whenStable();
      const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
      const period = lang === 'es' ? '01/01/2020 – 31/12/2099' : '01/01/2020 – 12/31/2099';
      const base = `Seguro Automotriz Total · ${period}`;
      const optionLabel = lang === 'es' ? 'Opción' : 'Option';
      expect(options).toHaveLength(2);
      expect(options.map((option) => option.getAttribute('aria-disabled'))).toEqual([
        'false',
        'false',
      ]);
      expect(options.map((option) => option.textContent?.trim())).toEqual([
        `${base} · ${optionLabel} 2`,
        `${base} · ${optionLabel} 1`,
      ]);
      for (const option of options) {
        expect(option.textContent).not.toContain(policy.id);
        expect(option.textContent).not.toContain(duplicatePolicy.id);
      }
      const dictionary = lang === 'es' ? es : en;
      expect(text()).toContain(dictionary.claims.presentationOptionsHelp);
      expect(text()).not.toContain(dictionary.claims.ambiguousPolicy);
      options[ordinal === 1 ? 1 : 0].click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.form.controls.polizaId.value).toBe(id);
      expect(select.triggerValue).toContain(`${optionLabel} ${ordinal}`);
      expect(component.policyLabel(id)).toBe(`${base} · ${optionLabel} ${ordinal}`);
      expect(component.form.valid).toBe(true);
      component.submit();
      expect(report).toHaveBeenCalledExactlyOnceWith({
        polizaId: id,
        fechaEvento: eventDate.toISOString(),
        tipoEvento: 'Colision',
        descripcion: 'Descripcion sintetica del evento',
        lugar: 'Bogota',
      });
      http.expectNone(url);
    },
  );

  it.each(['es', 'en'])(
    'retains ID/ordinal association through reordered refresh in %s without sorting the BFF list or resetting edits',
    (lang) => {
      loadPolicies([duplicatePolicy, policy]);
      TestBed.inject(TranslocoService).setActiveLang(lang);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const before = new Map(
        component.policyOptions.map((item) => [item.id, component.policyLabel(item.id)]),
      );
      expect(component.claims.policies().map((item) => item.id)).toEqual([
        duplicatePolicy.id,
        policy.id,
      ]);
      component.form.setValue({ ...fields, polizaId: duplicatePolicy.id });
      component.eventTime.setValue(new Date(2025, 0, 10, 12, 17));
      component.eventDay.setValue(new Date(2025, 0, 11));
      component.eventChoice.setValue('Hurto');
      const edited = component.form.getRawValue();
      const day = component.eventDay.value?.getTime();
      const time = component.eventTime.value?.getTime();
      component.claims.loadPolicies();
      loadPolicies([policy, duplicatePolicy]);
      expect(component.claims.policies().map((item) => item.id)).toEqual([
        policy.id,
        duplicatePolicy.id,
      ]);
      expect(component.policyOptions.map((item) => item.id)).toEqual([
        policy.id,
        duplicatePolicy.id,
      ]);
      for (const item of component.policyOptions) {
        expect(component.policyLabel(item.id)).toBe(before.get(item.id));
        expect(item.selectable).toBe(true);
      }
      expect(component.form.getRawValue()).toEqual(edited);
      expect(component.eventDay.value?.getTime()).toBe(day);
      expect(component.eventTime.value?.getTime()).toBe(time);
      expect(component.eventChoice.value).toBe('Hurto');
      http.expectNone(url);
    },
  );

  it('restores a duplicate pending ID and presentation label without changing its payload, key or time on refresh', () => {
    loadPolicies([policy, duplicatePolicy]);
    const attempt = {
      key: '44444444-4444-4444-8444-444444444444',
      payload: {
        ...fields,
        polizaId: duplicatePolicy.id,
        fechaEvento: new Date(2025, 0, 10, 12, 17).toISOString(),
      },
    };
    const storageKey = `solventa.claim-attempt.${TEST_USER.id}`;
    sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    fixture.destroy();
    fixture = TestBed.createComponent(ClaimReportPageComponent);
    fixture.detectChanges();
    loadCatalog();
    loadPolicies([duplicatePolicy, policy]);
    const component = fixture.componentInstance;
    const label = component.policyLabel(duplicatePolicy.id);
    expect(label).toBe('Seguro Automotriz Total · 01/01/2020 – 31/12/2099 · Opción 2');
    expect(text()).toContain(label);
    expect(text()).not.toContain(duplicatePolicy.id);
    expect(component.form.getRawValue()).toEqual(attempt.payload);
    expect(component.form.disabled).toBe(true);
    component.claims.loadPolicies();
    loadPolicies([policy, duplicatePolicy]);
    expect(component.policyLabel(duplicatePolicy.id)).toBe(label);
    expect(text()).toContain(label);
    expect(component.claims.attempt()).toEqual(attempt);
    expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toEqual(attempt);
    expect(component.form.getRawValue()).toEqual(attempt.payload);
    expect(component.eventDay.value?.getTime()).toBe(Date.parse(attempt.payload.fechaEvento));
    expect(component.eventTime.value?.getTime()).toBe(Date.parse(attempt.payload.fechaEvento));
    expect(component.form.disabled).toBe(true);
    http.expectNone(url);
  });

  it('shows catalog failure and retries without silently substituting product names', () => {
    loadPolicies();
    fixture.componentInstance.retryCatalog();
    fixture.detectChanges();
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`);
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(text()).toContain(es.claims.catalogError);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    fixture.componentInstance.retryCatalog();
    fixture.detectChanges();
    loadCatalog();
    expect(fixture.componentInstance.catalogStatus()).toBe('ready');
  });

  it('keeps manual text while alternating automotive suggestions and other products, sending text only', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    component.form.setValue(fields);
    component.eventChoice.setValue('Hurto');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[formControlName=tipoEvento]')).toBeNull();
    component.eventChoice.setValue('other');
    fixture.detectChanges();
    expect(component.form.controls.tipoEvento.value).toBe(fields.tipoEvento);
    component.eventChoice.setValue('Choque');
    component.submit();
    const request = http.expectOne(url);
    expect(request.request.body.tipoEvento).toBe('Choque');
    expect(Object.keys(request.request.body).sort()).toEqual([
      'descripcion',
      'fechaEvento',
      'lugar',
      'polizaId',
      'tipoEvento',
    ]);
    request.flush({}, { status: 400, statusText: 'Bad Request' });
  });

  it('parses ES/EN calendar dates without month/day guessing and keeps manual minutes', () => {
    loadPolicies();
    const adapter = fixture.debugElement.injector.get<DateAdapter<Date>>(DateAdapter);
    const spanish = adapter.parse('03/04/2025', null)!;
    expect([spanish.getMonth(), spanish.getDate()]).toEqual([3, 3]);
    expect(adapter.isValid(adapter.parse('31/02/2025', null)!)).toBe(false);
    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    const english = adapter.parse('03/04/2025', null)!;
    expect([english.getMonth(), english.getDate()]).toEqual([2, 4]);
    expect(adapter.parseTime('12:17', null)?.getMinutes()).toBe(17);
  });

  it('validates converted UTC policy boundaries and future time, not local date alone', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2025-01-11T12:00:00Z'));
    loadPolicies([{ ...policy, fechaInicio: '2025-01-10', fechaFin: '2025-01-10' }]);
    const component = fixture.componentInstance;
    component.form.setValue({ ...fields, fechaEvento: '2025-01-09T19:00:00-05:00' });
    expect(component.form.hasError('eventDate')).toBe(false);
    component.form.controls.fechaEvento.setValue('2025-01-10T19:00:00-05:00');
    expect(component.form.hasError('eventDate')).toBe(true);
    component.form.controls.fechaEvento.setValue('2025-01-11T13:00:00Z');
    expect(component.form.hasError('eventDate')).toBe(true);
    vi.restoreAllMocks();
  });

  it('retains the manual event after a suggested report is definitively rejected', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    component.form.setValue(fields);
    component.eventChoice.setValue('Hurto');
    component.submit();
    fixture.detectChanges();
    http.expectOne(url).flush({}, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    component.eventChoice.setValue('other');
    expect(component.form.controls.tipoEvento.value).toBe(fields.tipoEvento);
  });

  it('focuses an invalid field rather than reopening the valid calendar on failed submit', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    component.form.controls.polizaId.setValue(policy.id);
    component.form.controls.tipoEvento.setValue('Evento válido');
    fixture.detectChanges();
    component.form.controls.tipoEvento.setValue('');
    component.submit();
    fixture.detectChanges();
    expect(document.activeElement?.getAttribute('formcontrolname')).toBe('tipoEvento');
    expect(text()).toContain(es.claims.checkFields);
  });

  it('focuses a future time before the cross-field error and shows the date/time error once', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2025, 0, 10, 12).getTime());
    try {
      loadPolicies();
      const component = fixture.componentInstance;
      component.form.setValue(fields);
      component.eventDay.setValue(new Date(2025, 0, 10));
      component.eventTime.setValue(new Date(2025, 0, 10, 13, 17));
      fixture.detectChanges();
      expect(component.eventDay.valid).toBe(true);
      expect(component.eventTime.hasError('matTimepickerMax')).toBe(true);
      component.submit();
      fixture.detectChanges();
      expect(document.activeElement?.id).toBe('claim-event-time');
      expect(
        fixture.nativeElement.querySelector('#claim-event-date').getAttribute('aria-invalid'),
      ).toBe('false');
      expect(
        fixture.nativeElement.querySelector('#claim-event-time').getAttribute('aria-invalid'),
      ).toBe('true');
      expect(text().split(es.claims.validation.date).length - 1).toBe(1);
      expect(document.querySelector('mat-calendar')).toBeNull();
      expect(component.eventTime.enabled).toBe(true);
      http.expectNone(url);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('focuses time for a cross-field-only error without opening the calendar or posting', () => {
    loadPolicies();
    const component = fixture.componentInstance;
    component.form.setValue(fields);
    fixture.detectChanges();
    component.form.controls.fechaEvento.setValue('2099-01-10T12:00:00Z');
    expect(component.eventDay.valid).toBe(true);
    expect(component.eventTime.valid).toBe(true);
    expect(component.form.hasError('eventDate')).toBe(true);
    component.submit();
    fixture.detectChanges();
    expect(document.activeElement?.id).toBe('claim-event-time');
    expect(text().split(es.claims.validation.date).length - 1).toBe(1);
    expect(document.querySelector('mat-calendar')).toBeNull();
    http.expectNone(url);
  });

  it.each(['future-day', 'invalid-day', 'before-start', 'after-end', 'invalid-time'])(
    'focuses the editable date/time error for %s without POST',
    (scenario) => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2025-01-12T12:00:00Z'));
      try {
        loadPolicies([{ ...policy, fechaInicio: '2025-01-10', fechaFin: '2025-01-10' }]);
        const component = fixture.componentInstance;
        component.form.setValue(fields);
        const date = new Date('2025-01-10T12:00:00Z');
        component.eventDay.setValue(date);
        component.eventTime.setValue(date);
        fixture.detectChanges();
        if (scenario === 'future-day') component.eventDay.setValue(new Date('2099-01-10T12:00Z'));
        if (scenario === 'invalid-day') {
          const input: HTMLInputElement = fixture.nativeElement.querySelector('#claim-event-date');
          input.value = '31/02/2025';
          input.dispatchEvent(new Event('input'));
          input.dispatchEvent(new Event('blur'));
        }
        if (scenario === 'invalid-time') {
          const input: HTMLInputElement = fixture.nativeElement.querySelector('#claim-event-time');
          input.value = 'not a time';
          input.dispatchEvent(new Event('input'));
          input.dispatchEvent(new Event('blur'));
        }
        if (scenario === 'before-start' || scenario === 'after-end') {
          const boundary =
            scenario === 'before-start' ? component.periodStart! : component.periodEnd;
          const outside = new Date(boundary.getTime() + (scenario === 'before-start' ? -1 : 1));
          component.eventDay.setValue(outside);
          component.eventTime.setValue(outside);
        }
        fixture.detectChanges();
        component.submit();
        fixture.detectChanges();
        expect(document.activeElement?.id).toBe(
          component.eventDay.invalid ? 'claim-event-date' : 'claim-event-time',
        );
        expect(fixture.nativeElement.querySelector('.field-help + .validation-error')).toBeNull();
        expect(text()).toContain(es.claims.validation.date);
        expect(document.querySelector('mat-calendar')).toBeNull();
        http.expectNone(url);
      } finally {
        vi.restoreAllMocks();
      }
    },
  );

  it('localizes the clock panel through the installed public aria-label input', () => {
    loadPolicies();
    const clock = fixture.debugElement.query(By.directive(MatTimepicker)).componentInstance;
    expect(clock.ariaLabel()).toBe(es.claims.time);
    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    expect(clock.ariaLabel()).toBe(en.claims.time);
  });

  it('does not reset the recovered timestamp or minutes on policy refresh', () => {
    loadPolicies();
    submit();
    const request = http.expectOne(url);
    const body = request.request.body;
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    fixture.destroy();
    fixture = TestBed.createComponent(ClaimReportPageComponent);
    fixture.detectChanges();
    loadCatalog();
    loadPolicies();
    const component = fixture.componentInstance;
    expect(component.form.controls.fechaEvento.value).toBe(body.fechaEvento);
    expect(component.eventTime.value?.getTime()).toBe(Date.parse(body.fechaEvento));
    component.claims.loadPolicies();
    loadPolicies();
    expect(component.form.controls.fechaEvento.value).toBe(body.fechaEvento);
    expect(component.eventTime.disabled).toBe(true);
    expect(text()).not.toContain(body.polizaId);
  });

  it.each([
    'travel',
    'life',
    'device-protection',
    'parametric',
    'parametric-weather',
    'payment-protection',
    'mortgage-life',
  ])('uses only manual events for %s and preserves previous manual text', (tipo) => {
    fixture.componentInstance.retryCatalog();
    fixture.detectChanges();
    loadCatalog([
      {
        id: tipo,
        nombre: `Seguro ${tipo}`,
        descripcion: 'Seguro sintético',
        disponible: true,
        coberturasPrincipales: [],
      },
    ]);
    loadPolicies([{ ...policy, tipo }]);
    const component = fixture.componentInstance;
    component.form.setValue(fields);
    component.eventChoice.setValue('Hurto');
    fixture.detectChanges();
    expect(component.isAutomotive).toBe(false);
    expect(fixture.nativeElement.querySelector('input[formControlName=tipoEvento]')).not.toBeNull();
    expect(component.form.controls.tipoEvento.value).toBe(fields.tipoEvento);
    component.submit();
    const request = http.expectOne(url);
    expect(request.request.body.tipoEvento).toBe('Colision');
    request.flush({}, { status: 400, statusText: 'Bad Request' });
  });

  it('blocks an unknown product and duplicate product names without arbitrary fallback', () => {
    loadPolicies([{ ...policy, tipo: 'missing' }]);
    expect(fixture.componentInstance.policyOptions[0].selectable).toBe(false);
    expect(text()).toContain(es.claims.ambiguousPolicy);
    fixture.componentInstance.retryCatalog();
    fixture.detectChanges();
    loadCatalog([
      {
        id: 'missing',
        nombre: 'Seguro A',
        descripcion: 'Sintético',
        disponible: true,
        coberturasPrincipales: [],
      },
      {
        id: 'missing',
        nombre: 'Seguro B',
        descripcion: 'Sintético',
        disponible: true,
        coberturasPrincipales: [],
      },
    ]);
    expect(fixture.componentInstance.policyOptions[0].selectable).toBe(false);
    expect(fixture.componentInstance.policyLabel(policy.id)).not.toContain('Seguro A');
  });

  it('updates UTC coverage validation on policy changes without replacing an edited timestamp', () => {
    loadPolicies([
      policy,
      { ...policy, id: '33333333-3333-4333-8333-333333333333', fechaInicio: '2026-01-01' },
    ]);
    const component = fixture.componentInstance;
    component.form.setValue(fields);
    expect(component.form.hasError('eventDate')).toBe(false);
    component.form.controls.polizaId.setValue('33333333-3333-4333-8333-333333333333');
    expect(component.form.hasError('eventDate')).toBe(true);
    expect(component.form.controls.fechaEvento.value).toBe(fields.fechaEvento);
  });

  it('opens calendar on click, not focus, with public Material controls', async () => {
    loadPolicies();
    const date: HTMLInputElement = fixture.nativeElement.querySelector('#claim-event-date');
    date.focus();
    fixture.detectChanges();
    expect(document.querySelector('mat-calendar')).toBeNull();
    date.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('mat-calendar')).not.toBeNull();
    fixture.debugElement.query(By.directive(MatDatepicker)).componentInstance.close();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.debugElement.query(By.directive(MatDatepicker)).componentInstance.opened).toBe(
      false,
    );
  });
});
import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';

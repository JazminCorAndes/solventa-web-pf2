import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { PartnerContext, PartnerContextService } from '../../core/partners/partner-context.service';
import { PartnerClientsPageComponent } from './partner-clients-page.component';

const CONTEXT: PartnerContext = {
  apiVersion: '1',
  usuario: {
    id: 'partner-user',
    nombre: 'Socio prueba',
    correo: 'partner@example.test',
    rol: 'socio',
    socios: ['BANK-A', 'BANK-B'],
  },
  socios: [
    { socioId: 'BANK-A', productos: ['mortgage-life'] },
    { socioId: 'BANK-B', productos: ['mortgage-life'] },
  ],
  alcances: ['clientes:consultar'],
};
const CLIENT = {
  clienteId: '22222222-2222-4222-8222-222222222222',
  nombre: 'Cliente autorizado',
  tipoDocumento: 'cc',
  numeroDocumentoEnmascarado: '******5678',
  consentimientoEstado: 'vigente',
};
const URL = `${environment.apiBaseUrl}/v1/socios/clientes`;

describe('PartnerClientsPageComponent', () => {
  let fixture: ComponentFixture<PartnerClientsPageComponent>;
  let http: HttpTestingController;
  const context = signal<PartnerContext | null>(CONTEXT);
  const params = new BehaviorSubject(convertToParamMap({ socio: 'BANK-A' }));

  beforeEach(async () => {
    context.set(CONTEXT);
    params.next(convertToParamMap({ socio: 'BANK-A' }));
    await TestBed.configureTestingModule({
      imports: [
        PartnerClientsPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PartnerContextService, useValue: { context } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PartnerClientsPageComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  const request = (socio = 'BANK-A') =>
    http.expectOne(`${URL}?socioId=${socio}&productoId=mortgage-life`);

  it('renders unique customers and links their explicit detail to the same partner', () => {
    expect(fixture.nativeElement.textContent).toContain(es.partnerClients.loading);
    request().flush({ clientes: [CLIENT, CLIENT] });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.textContent).toContain(CLIENT.nombre);
    expect(root.textContent).toContain(CLIENT.numeroDocumentoEnmascarado);
    expect(root.querySelector('tbody a')?.getAttribute('href')).toBe(
      `/app/socios/clientes/consultar?socio=BANK-A&cliente=${CLIENT.clienteId}`,
    );
    expect(root.querySelector('form')).toBeNull();
  });

  it('shows redacted associations without personal fields or a detail action', () => {
    request().flush({
      clientes: [
        {
          ...CLIENT,
          nombre: null,
          tipoDocumento: null,
          numeroDocumentoEnmascarado: null,
          consentimientoEstado: 'revocado',
        },
      ],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain(CLIENT.clienteId);
    expect(root.textContent).not.toContain(CLIENT.nombre);
    expect(root.textContent).not.toContain(CLIENT.numeroDocumentoEnmascarado);
    expect(root.querySelector('tbody a')).toBeNull();
  });

  it('distinguishes an empty list from errors and allows retrying', () => {
    request().flush({ clientes: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.partnerClients.empty);
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    request().flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      es.partnerClients.unavailable,
    );
    expect(fixture.nativeElement.textContent).not.toContain(es.partnerClients.empty);
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    request().flush({ clientes: [CLIENT] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(CLIENT.nombre);
  });

  it('cancels in-flight reads and drops old customers when the partner changes', () => {
    const old = request();
    params.next(convertToParamMap({ socio: 'BANK-B' }));
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(fixture.componentInstance.clients()).toEqual([]);
    request('BANK-B').flush({ clientes: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain(CLIENT.nombre);
  });

  it.each([401, 403])(
    'shows access failures (%s) without treating them as an empty list',
    (status) => {
      request().flush({}, { status, statusText: 'Access unavailable' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain(es.partnerClients.empty);
      expect(fixture.componentInstance.clients()).toEqual([]);
    },
  );

  it.each(['scope', 'user', 'partner', 'product'] as const)(
    'removes customer data and prevents reads when %s changes outside the authorized context',
    (change) => {
      request().flush({ clientes: [CLIENT] });
      fixture.detectChanges();
      if (change === 'scope') context.set({ ...CONTEXT, alcances: [] });
      if (change === 'user') context.set(null);
      if (change === 'partner') params.next(convertToParamMap({ socio: 'UNAUTHORIZED' }));
      if (change === 'product')
        context.set({
          ...CONTEXT,
          socios: [{ socioId: 'BANK-A', productos: ['automotive'] }],
        });
      fixture.detectChanges();
      expect(fixture.componentInstance.clients()).toEqual([]);
      expect(fixture.nativeElement.textContent).not.toContain(CLIENT.nombre);
      expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
      http.expectNone((pending) => pending.url === URL);
    },
  );

  it('requires explicit organization selection when several partners are authorized', () => {
    const old = request();
    params.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(es.partnerClients.choosePartner);
    http.expectNone((pending) => pending.url === URL);
  });
});

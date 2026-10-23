import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { PartnerContextService } from '../../core/partners/partner-context.service';
import { QUOTE_REQUEST_GATEWAY } from '../../core/quotes/quote-request.gateway';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import {
  PartnerQuoteRequest,
  PartnerQuoteResult,
} from '../../data-access/quotes/http-partner-quote.gateway';
import { HttpQuoteRequestGateway } from '../../data-access/quotes/http-quote-request.gateway';
import { QuoteRequestPageComponent } from '../quotes/quote-request-page.component';
import { PartnerQuotePanelComponent } from './partner-quote-panel.component';

const customerId = '22222222-2222-4222-8222-222222222222';
const consentId = '33333333-3333-4333-8333-333333333333';
const quoteId = '44444444-4444-4444-8444-444444444444';
const products = [
  'automotive',
  'travel',
  'life',
  'device-protection',
  'parametric',
  'parametric-weather',
  'payment-protection',
  'mortgage-life',
];
const base = `${environment.apiBaseUrl}/v1`;
const endpoint = `${base}/socios/solicitudes-cotizacion`;

describe('Cotizacion socio integrada con formulario y HTTP autenticado', () => {
  let fixture: ComponentFixture<QuoteRequestPageComponent>;
  let page: QuoteRequestPageComponent;
  let panel: PartnerQuotePanelComponent;
  let http: HttpTestingController;
  let router: Router;
  let navigate: ReturnType<typeof vi.spyOn>;
  let query: Record<string, string>;
  const context = signal({
    apiVersion: '1',
    usuario: {
      id: 'partner-user',
      nombre: 'Socio QA',
      correo: 'partner@example.com',
      rol: 'socio',
      socios: ['BANCO-001', 'BANCO-002'],
    },
    socios: [
      { socioId: 'BANCO-001', productos: products },
      { socioId: 'BANCO-002', productos: ['life'] },
    ],
    alcances: ['perfilamientos:crear'],
  });

  beforeEach(async () => {
    query = { socio: 'BANCO-001' };
    await TestBed.configureTestingModule({
      imports: [
        QuoteRequestPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { partnerMode: true },
              get queryParamMap() {
                return convertToParamMap(query);
              },
            },
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'partner-user', role: 'partner' }),
            getAccessToken: () => of('synthetic-test-token'),
          },
        },
        { provide: PartnerContextService, useValue: { context } },
        { provide: QUOTE_REQUEST_GATEWAY, useClass: HttpQuoteRequestGateway },
        {
          provide: QUOTE_REQUEST_STORAGE,
          useValue: { read: () => null, write: vi.fn(), clear: vi.fn() },
        },
        { provide: OFFER_SELECTION_STORAGE, useValue: { clear: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    createPage();
  });

  function createPage(): void {
    fixture = TestBed.createComponent(QuoteRequestPageComponent);
    page = fixture.componentInstance;
    fixture.detectChanges();
    const catalog = http.match(`${base}/productos-seguro`);
    catalog.forEach((request) =>
      request.flush({
        productos: products.map((id) => ({ id, nombre: id, descripcion: id, disponible: true })),
      }),
    );
    http
      .match(`${base}/destinos-viaje`)
      .forEach((request) => request.flush({ destinos: [{ codigo: 'CO', nombre: 'Colombia' }] }));
    fixture.detectChanges();
    panel = page.partnerPanel()!;
  }

  function fillCustomer(): void {
    panel.form.patchValue({
      clienteId: customerId,
      tipoDocumento: 'cc',
      numeroDocumento: '1023456789',
      telefono: '+573001234567',
      consentimientoId: consentId,
      consentimientoVersion: 2,
    });
    page.form.patchValue({ productId: 'automotive', vehiclePlate: 'abc123' });
  }

  function result(request: PartnerQuoteRequest): PartnerQuoteResult {
    return {
      operationId: request.operationId,
      socioId: request.socioId,
      clienteId: request.cliente.clienteId,
      productoId: request.productoId,
      estado: 'completada',
      perfilamientoReferencia: 'perfil-real',
      solicitudId: 'AQT-2026-123456',
      cotizacionId: quoteId,
      recibidaEn: '2026-10-23T05:00:00Z',
    };
  }

  async function submit() {
    page.submit();
    await Promise.resolve();
    await Promise.resolve();
    return http.expectOne(endpoint);
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });

  it('reutiliza catalogo y formulario sin consultar ni aprobar consentimiento delegado', async () => {
    fillCustomer();
    const request = await submit();
    expect(request.request.headers.get('Authorization')).toBe('Bearer synthetic-test-token');
    expect(request.request.body).toEqual({
      operationId: panel.operationId(),
      socioId: 'BANCO-001',
      productoId: 'automotive',
      datosProducto: { vehiclePlate: 'ABC123' },
      cliente: {
        clienteId: customerId,
        tipoCliente: 'persona_natural',
        tipoDocumento: 'cc',
        numeroDocumento: '1023456789',
        telefono: '+573001234567',
      },
      consentimientoId: consentId,
      consentimientoVersion: 2,
    });
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { socio: 'BANCO-001', operacion: panel.operationId() },
        replaceUrl: true,
      }),
    );
    expect(panel.result()).toBeNull();
    expect(page.form.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('app-profiling-panel')).toBeNull();
    http.expectNone((pending) => pending.url.includes('/consentimientos/'));
    request.flush(result(request.request.body));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.partnerQuote.completed);
    expect(TestBed.inject(QUOTE_REQUEST_STORAGE).write).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith(['/app/cotizaciones/ofertas']);
  });

  it.each([
    ['life', { birthDate: new Date(1985, 1, 10) }, { birthDate: '1985-02-10' }],
    [
      'mortgage-life',
      { birthDate: new Date(1985, 1, 10), mortgageBalance: '310000000' },
      { birthDate: '1985-02-10', mortgageBalance: '310000000' },
    ],
    [
      'device-protection',
      { deviceType: 'Teléfono', brandModel: 'Modelo QA', purchaseValue: '1200000' },
      { deviceType: 'Teléfono', brandModel: 'Modelo QA', purchaseValue: '1200000' },
    ],
    [
      'payment-protection',
      { creditType: 'Consumo', monthlyPayment: '500000' },
      { creditType: 'Consumo', monthlyPayment: '500000' },
    ],
    [
      'travel',
      {
        destination: { code: 'CO', name: 'Colombia' },
        departureDate: new Date(2099, 0, 2),
        returnDate: new Date(2099, 0, 3),
      },
      { destinationCountryCode: 'CO', departureDate: '2099-01-02', returnDate: '2099-01-03' },
    ],
    [
      'parametric',
      {
        airline: 'Avianca',
        flightNumber: 'av123',
        flightDate: new Date(2099, 0, 2),
        coverageType: 'comprehensive',
      },
      {
        airline: 'Avianca',
        flightNumber: 'AV123',
        flightDate: '2099-01-02',
        coverageType: 'comprehensive',
      },
    ],
    [
      'parametric-weather',
      {
        location: 'Bogotá',
        weatherEvent: 'drought',
        startDate: new Date(2099, 0, 2),
        endDate: new Date(2099, 0, 3),
        insuredAmount: '1000000',
      },
      {
        location: 'Bogotá',
        weatherEvent: 'drought',
        startDate: '2099-01-02',
        endDate: '2099-01-03',
        insuredAmount: '1000000',
      },
    ],
  ])('conserva datosProducto existentes para %s', async (productId, values, expected) => {
    fillCustomer();
    page.form.patchValue({ productId, ...values });
    const request = await submit();
    expect(request.request.body.datosProducto).toEqual(expected);
    request.flush(result(request.request.body));
  });

  it('bloquea cliente incompleto, datos producto invalidos y productos ajenos a la organizacion', () => {
    page.form.patchValue({ productId: 'automotive', vehiclePlate: 'ABC123' });
    page.submit();
    expect(panel.form.controls.clienteId.touched).toBe(true);
    fillCustomer();
    page.form.controls.vehiclePlate.setValue('invalida');
    page.submit();
    expect(page.form.controls.vehiclePlate.invalid).toBe(true);
    page.form.controls.vehiclePlate.setValue('ABC123');
    panel.form.controls.socioId.setValue('BANCO-002');
    expect(page.products().map((product) => product.id)).toEqual(['life']);
    page.submit();
    expect(page.form.controls.productId.invalid).toBe(true);
    http.expectNone(endpoint);
  });

  it.each([
    [503, 'perfilamiento_no_disponible'],
    [422, 'consentimiento_no_vigente'],
    [409, 'operacion_en_curso'],
  ])('reintenta HTTP %s con mismo UUID y cuerpo sin exito simulado', async (status, code) => {
    fillCustomer();
    const request = await submit();
    const original = request.request.body;
    request.flush({ code }, { status, statusText: 'Error' });
    expect(panel.result()).toBeNull();
    expect(page.partnerLocked()).toBe(true);
    panel.retry();
    const retry = http.expectOne(endpoint);
    expect(retry.request.body).toEqual(original);
    expect(retry.request.headers.get('Idempotency-Key')).toBe(original.operationId);
    retry.flush(result(original));
    expect(panel.result()?.solicitudId).toBe('AQT-2026-123456');
  });

  it('respeta Retry-After sin lanzar consultas ni nueva operacion durante la espera', async () => {
    vi.useFakeTimers();
    fillCustomer();
    const request = await submit();
    const id = panel.operationId();
    request.flush(
      { code: 'cuota_socio_excedida' },
      { status: 429, statusText: 'Quota', headers: { 'Retry-After': '2' } },
    );
    panel.retry();
    panel.recover();
    panel.newOperation();
    http.expectNone(endpoint);
    expect(panel.operationId()).toBe(id);
    vi.advanceTimersByTime(2000);
    panel.retry();
    const retry = http.expectOne(endpoint);
    expect(retry.request.body.operationId).toBe(id);
    retry.flush(result(retry.request.body));
  });

  it('recarga solo con GET y conserva operacion al reintroducir datos tras fallo reintentable', async () => {
    fillCustomer();
    const request = await submit();
    const original: PartnerQuoteRequest = request.request.body;
    request.flush({ code: 'perfilamiento_no_disponible' }, { status: 503, statusText: 'Error' });
    fixture.destroy();
    query = { socio: original.socioId, operacion: original.operationId };
    createPage();
    http.expectNone(endpoint);
    http
      .expectOne(`${endpoint}/${original.operationId}?socioId=BANCO-001`)
      .flush({ code: 'operacion_reintentable' }, { status: 409, statusText: 'Conflict' });
    expect(panel.operationId()).toBe(original.operationId);
    expect(panel.form.controls.socioId.disabled).toBe(true);
    fillCustomer();
    const retry = await submit();
    expect(retry.request.body).toEqual(original);
    retry.flush(result(original));
  });

  it('recupera resultado persistido sin crear otra solicitud ni exponer datos ajenos', async () => {
    fillCustomer();
    const request = await submit();
    const original: PartnerQuoteRequest = request.request.body;
    request.flush(result(original));
    fixture.destroy();
    query = { socio: original.socioId, operacion: original.operationId };
    createPage();
    const recovery = http.expectOne(`${endpoint}/${original.operationId}?socioId=BANCO-001`);
    recovery.flush({ ...result(original), socioId: 'OTRO-SOCIO' });
    expect(panel.result()).toBeNull();
    panel.recover();
    http.expectOne(`${endpoint}/${original.operationId}?socioId=BANCO-001`).flush(result(original));
    expect(panel.result()?.operationId).toBe(original.operationId);
    http.expectNone(endpoint);
  });
});

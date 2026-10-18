import { registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { OFFER_GATEWAY } from '../../core/offers/offer.gateway';
import { SelectedOfferRecord } from '../../core/offers/offer.models';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { OfferSelectionService } from '../../core/offers/offer-selection.service';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { HttpOfferGateway } from '../../data-access/offers/http-offer.gateway';
import { OfferSelectionPageComponent } from './offer-selection-page.component';

const REQUEST: QuoteRequestRecord = {
  id: 'AQT-2026-C0D47D9875',
  productId: 'automotive',
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '1234567890',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@solventa.co',
  phone: '+573001234567',
  status: 'received',
  createdAt: '2026-10-18T12:00:00Z',
};

const OFFER = {
  id: 'offer-001',
  version: 1,
  nombre: 'Plan Integral',
  descripcion: 'Cobertura integral',
  prima: { monto: '48000', moneda: 'COP' },
  periodicidad: 'mensual',
  coberturaPrincipal: 'Cobertura principal',
  deducible: 'Sin deducible',
  vigencia: 'Anual',
  responsabilidadCivil: 'Hasta $1.000.000.000 COP',
  coberturas: ['Danos materiales'],
  condiciones: ['Inspeccion previa'],
  beneficiosAdicionales: ['Asistencia'],
  recomendada: true,
  estado: 'disponible',
  vigenteHasta: '2030-01-01T00:00:00Z',
};

const CALCULATION = {
  solicitudId: REQUEST.id,
  calculadaEn: REQUEST.createdAt,
  vigenteHasta: OFFER.vigenteHasta,
  tasaAplicada: 'Estandar',
  ofertas: [
    OFFER,
    { ...OFFER, id: 'offer-002', nombre: 'Plan Plus', recomendada: false },
    { ...OFFER, id: 'offer-003', nombre: 'Plan Basico', recomendada: false },
  ],
};

describe('OfferSelectionPageComponent', () => {
  let fixture: ComponentFixture<OfferSelectionPageComponent>;
  let http: HttpTestingController;
  let service: OfferSelectionService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let selection: SelectedOfferRecord | null;
  const quoteStorage = { read: vi.fn(() => REQUEST) };
  const profiling = {
    loadConsent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 503 }))),
    saveConsent: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 503 }))),
    loadProfile: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 }))),
  };
  const apiUrl = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion`;

  beforeAll(() => registerLocaleData(localeEsCo));

  beforeEach(async () => {
    selection = null;
    quoteStorage.read.mockReturnValue(REQUEST);
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [
        OfferSelectionPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es: {} },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAccessToken: () => of('test-access-token') } },
        { provide: OFFER_GATEWAY, useClass: HttpOfferGateway },
        { provide: QUOTE_REQUEST_STORAGE, useValue: quoteStorage },
        {
          provide: OFFER_SELECTION_STORAGE,
          useValue: {
            read: () => selection,
            write: (value: SelectedOfferRecord) => (selection = value),
            clear: () => (selection = null),
          },
        },
        { provide: PROFILING_GATEWAY, useValue: profiling },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OfferSelectionService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(OfferSelectionPageComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    expect(profiling.loadConsent).not.toHaveBeenCalled();
    expect(profiling.saveConsent).not.toHaveBeenCalled();
    expect(profiling.loadProfile).not.toHaveBeenCalled();
  });

  function flushOffers(response = CALCULATION): void {
    const request = http.expectOne(`${apiUrl}/${response.solicitudId}/ofertas`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    request.flush(response);
    const storedSelection = http.expectOne(`${apiUrl}/${response.solicitudId}/seleccion`);
    expect(storedSelection.request.headers.get('Authorization')).toBe('Bearer test-access-token');
    storedSelection.flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
  }

  it('carga los planes directamente sin panel ni consultas de perfilamiento, incluso al recuperar foco', () => {
    expect(service.status()).toBe('loading');
    expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-profiling-panel')).toBeNull();

    flushOffers();
    window.dispatchEvent(new Event('focus'));
    fixture.detectChanges();

    expect(service.status()).toBe('ready');
    expect(fixture.nativeElement.querySelectorAll('.plan-card')).toHaveLength(3);
    expect(fixture.nativeElement.textContent).not.toContain('profiling.');
    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
  });

  it('permite elegir un plan sin perfilamiento y conserva solicitud, prima y periodicidad', () => {
    flushOffers();
    const button = fixture.nativeElement.querySelector('.plan-actions button') as HTMLButtonElement;

    button.click();
    fixture.detectChanges();

    expect(selection).toMatchObject({
      quoteId: REQUEST.id,
      offerId: OFFER.id,
      offerVersion: OFFER.version,
      premium: { amount: 48_000, currency: 'COP' },
      periodicity: 'mensual',
      confirmed: false,
    });
    expect(service.canContinue()).toBe(true);
    expect(button.disabled).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/app/cotizaciones/aceptacion']);
  });

  it('muestra el estado vacio si el backend no devuelve planes', () => {
    flushOffers({ ...CALCULATION, ofertas: [] });

    expect(service.status()).toBe('empty');
    expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain(
      'offers.empty.title',
    );
    expect(fixture.nativeElement.querySelector('.plan-card')).toBeNull();
  });

  it.each([
    { status: 503, body: {}, key: 'offers.errors.loadBody' },
    { status: 403, body: {}, key: 'offers.errors.loadBody' },
    {
      status: 422,
      body: { code: 'perfil_vencido' },
      key: 'profiling.errors.expired',
    },
  ])('conserva el error real de ofertas $status y permite reintentar', ({ status, body, key }) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(`${apiUrl}/${REQUEST.id}/ofertas`).flush(body, { status, statusText: 'Error' });
    fixture.detectChanges();

    expect(service.status()).toBe('error');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(key);
    expect(fixture.nativeElement.querySelector('.plan-card')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();

    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    flushOffers();

    expect(service.status()).toBe('ready');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('vuelve a cargar las ofertas de la solicitud vigente al entrar de nuevo', () => {
    flushOffers();
    fixture.destroy();
    const nextRequest = { ...REQUEST, id: 'AQT-2026-NEWREQUEST' };
    quoteStorage.read.mockReturnValue(nextRequest);

    fixture = TestBed.createComponent(OfferSelectionPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.plan-card')).toBeNull();
    flushOffers({ ...CALCULATION, solicitudId: nextRequest.id });

    expect(service.calculation()?.quoteId).toBe(nextRequest.id);
    expect(fixture.nativeElement.querySelectorAll('.plan-card')).toHaveLength(3);
  });
});

import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { HttpQuoteRequestGateway } from '../../data-access/quotes/http-quote-request.gateway';
import { HttpOfferGateway } from '../../data-access/offers/http-offer.gateway';
import { HttpSubscriptionGateway } from '../../data-access/subscriptions/http-subscription.gateway';
import { OFFER_GATEWAY } from '../offers/offer.gateway';
import {
  BrowserOfferSelectionStorage,
  OFFER_SELECTION_STORAGE,
} from '../offers/offer-selection-storage.service';
import {
  BrowserSubscriptionStorage,
  SUBSCRIPTION_STORAGE,
} from '../subscriptions/subscription-storage.service';
import { SUBSCRIPTION_GATEWAY } from '../subscriptions/subscription.gateway';
import { QUOTE_REQUEST_GATEWAY } from './quote-request.gateway';
import { BrowserQuoteRequestStorage, QUOTE_REQUEST_STORAGE } from './quote-request-storage.service';
import { QuoteRequestService } from './quote-request.service';
import { quoteResumeGuard } from './quote-resume.guard';

@Component({ template: '' })
class FlowPage {}

const REQUEST = {
  id: 'historical-request',
  productoId: 'automotive',
  tipoCliente: 'persona_natural',
  tipoDocumento: 'cc',
  identificacion: '123456789',
  datosProducto: { vehiclePlate: 'ABC123' },
  correo: 'cliente@example.com',
  telefono: '+573001234567',
  estado: 'recibida',
  creadaEn: '2026-10-01T12:00:00Z',
};
const SELECTION = {
  solicitudId: REQUEST.id,
  ofertaId: 'offer-1',
  version: 1,
  nombreOferta: 'Plan contratado',
  prima: { monto: '10000.00', moneda: 'COP' },
  periodicidad: 'mensual',
  seleccionadaEn: '2026-10-01T12:01:00Z',
};
const SUBSCRIPTION = {
  id: 'subscription-1',
  solicitudId: REQUEST.id,
  ofertaId: SELECTION.ofertaId,
  ofertaVersion: 1,
  estado: 'aprobada',
  reglaVersion: 'rule-1',
  creadaEn: '2026-10-01T12:02:00Z',
  actualizadaEn: '2026-10-01T12:03:00Z',
  decision: {
    resultado: 'aprobada',
    reglaVersion: 'rule-1',
    hashDecision: 'a'.repeat(64),
    decididaEn: '2026-10-01T12:02:00Z',
  },
  saga: { estado: 'pago_confirmado', version: 2, actualizadaEn: '2026-10-01T12:03:00Z' },
  vigenteDesde: '2026-10-01T12:03:00Z',
  vigenteHasta: '2027-10-01T12:03:00Z',
};

describe('historical quote route integration', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}`;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'app/cotizaciones', component: FlowPage },
          ...['ofertas', 'aceptacion', 'suscripcion', 'suscripcion/detalle'].map((step) => ({
            path: `app/cotizaciones/${step}`,
            component: FlowPage,
            canActivate: [quoteResumeGuard],
          })),
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QUOTE_REQUEST_GATEWAY, useClass: HttpQuoteRequestGateway },
        { provide: OFFER_GATEWAY, useClass: HttpOfferGateway },
        { provide: SUBSCRIPTION_GATEWAY, useClass: HttpSubscriptionGateway },
        { provide: QUOTE_REQUEST_STORAGE, useClass: BrowserQuoteRequestStorage },
        { provide: OFFER_SELECTION_STORAGE, useClass: BrowserOfferSelectionStorage },
        { provide: SUBSCRIPTION_STORAGE, useClass: BrowserSubscriptionStorage },
      ],
    });
    TestBed.inject(QUOTE_REQUEST_STORAGE).clear();
    TestBed.inject(OFFER_SELECTION_STORAGE).clear();
    TestBed.inject(SUBSCRIPTION_STORAGE).clear();
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    TestBed.inject(QUOTE_REQUEST_STORAGE).clear();
    TestBed.inject(OFFER_SELECTION_STORAGE).clear();
    TestBed.inject(SUBSCRIPTION_STORAGE).clear();
  });

  async function recover(step: string, selected: boolean, subscribed: boolean) {
    const navigation = harness.navigateByUrl(`/app/cotizaciones/${step}?solicitud=${REQUEST.id}`);
    const request = await vi.waitFor(() => http.expectOne(base));
    expect(request.request.method).toBe('GET');
    request.flush(REQUEST);
    const selection = http.expectOne(`${base}/seleccion`);
    expect(selection.request.method).toBe('GET');
    if (selected) {
      selection.flush(SELECTION);
    } else {
      selection.flush({}, { status: 404, statusText: 'Not Found' });
    }
    const subscription = http.expectOne(`${base}/suscripcion`);
    expect(subscription.request.method).toBe('GET');
    if (subscribed) {
      subscription.flush(SUBSCRIPTION);
    } else {
      subscription.flush({}, { status: 404, statusText: 'Not Found' });
    }
    await navigation;
  }

  it.each([
    ['ofertas', false, false],
    ['aceptacion', true, false],
    ['suscripcion', true, true],
    ['suscripcion/detalle', true, true],
  ] as const)(
    'recovers %s from persisted HTTP data with empty browser storage',
    async (step, selected, subscribed) => {
      await recover(step, selected, subscribed);
      expect(TestBed.inject(Router).url).toBe(`/app/cotizaciones/${step}?solicitud=${REQUEST.id}`);
      expect(TestBed.inject(QuoteRequestService).latestRequest()?.id).toBe(REQUEST.id);
      expect(TestBed.inject(QUOTE_REQUEST_STORAGE).read()?.productData).toEqual(
        REQUEST.datosProducto,
      );
      expect(TestBed.inject(OFFER_SELECTION_STORAGE).read()?.offerId ?? null).toBe(
        selected ? SELECTION.ofertaId : null,
      );
      expect(TestBed.inject(SUBSCRIPTION_STORAGE).read()?.validUntil ?? null).toBe(
        subscribed ? SUBSCRIPTION.vigenteHasta : null,
      );
    },
  );

  it('does not enter payment when the selected request has no subscription', async () => {
    await recover('suscripcion', true, false);
    expect(TestBed.inject(Router).url).toBe('/app/cotizaciones/aceptacion');
  });

  it('shows a recovery error on an inaccessible request instead of opening cached data', async () => {
    const navigation = harness.navigateByUrl(`/app/cotizaciones/ofertas?solicitud=${REQUEST.id}`);
    const request = await vi.waitFor(() => http.expectOne(base));
    request.flush({}, { status: 403, statusText: 'Forbidden' });
    await navigation;
    expect(TestBed.inject(Router).url).toBe('/app/cotizaciones?error=resume');
    expect(TestBed.inject(QUOTE_REQUEST_STORAGE).read()).toBeNull();
  });
});

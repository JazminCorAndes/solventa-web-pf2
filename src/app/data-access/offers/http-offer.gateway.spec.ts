import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { QuoteRequestRecord } from '../../core/quotes/quote-request.models';
import {
  QUOTE_REQUEST_STORAGE,
  QuoteRequestStorage,
} from '../../core/quotes/quote-request-storage.service';
import { HttpOfferGateway } from './http-offer.gateway';
import { environment } from '../../../environments/environment';

const REQUEST: QuoteRequestRecord = {
  id: 'AQT-2026-ABCDEF1234',
  productId: 'automotive',
  customerType: 'natural',
  documentType: 'cc',
  nationalId: '1.234.567.890',
  productData: { vehiclePlate: 'ABC123' },
  email: 'cliente@solventa.co',
  phone: '+573001234567',
  status: 'received',
  createdAt: '2026-10-11T18:00:00Z',
};

const OFFER = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  nombre: 'Seguro Automotriz Pro',
  descripcion: 'Cobertura extendida',
  primaMensual: { monto: '189900', moneda: 'COP' },
  coberturaPrincipal: 'Daños propios y terceros',
  deducible: '$500.000 COP',
  vigencia: 'Anual',
  responsabilidadCivil: 'Hasta $1.000.000.000 COP',
  coberturas: ['Daños materiales'],
  condiciones: ['Inspección previa'],
  beneficiosAdicionales: ['Auto de reemplazo'],
  recomendada: true,
  estado: 'disponible' as const,
  vigenteHasta: '2026-10-26T18:00:00Z',
};

class TestQuoteStorage implements QuoteRequestStorage {
  read(): QuoteRequestRecord {
    return REQUEST;
  }
  write(): void {}
  clear(): void {}
}

describe('HttpOfferGateway', () => {
  let gateway: HttpOfferGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HttpOfferGateway,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: QUOTE_REQUEST_STORAGE, useClass: TestQuoteStorage },
      ],
    });
    gateway = TestBed.inject(HttpOfferGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps offers from the latest quote request', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`);
    expect(request.request.withCredentials).toBe(false);
    request.flush({
      solicitudId: REQUEST.id,
      calculadaEn: '2026-10-11T18:00:00Z',
      vigenteHasta: '2026-10-26T18:00:00Z',
      tasaAplicada: 'Estándar',
      ofertas: [OFFER],
    });

    await expect(result).resolves.toMatchObject({
      quoteId: REQUEST.id,
      offers: [
        {
          id: OFFER.id,
          monthlyPremium: { amount: 189_900, currency: 'COP' },
          status: 'available',
        },
      ],
    });
  });

  it('confirms an offer with an idempotency key', async () => {
    const result = firstValueFrom(gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version));
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    request.flush({
      solicitudId: REQUEST.id,
      ofertaId: OFFER.id,
      version: OFFER.version,
      nombreOferta: OFFER.nombre,
      primaMensual: OFFER.primaMensual,
      seleccionadaEn: '2026-10-11T18:05:00Z',
    });

    await expect(result).resolves.toMatchObject({
      quoteId: REQUEST.id,
      offerId: OFFER.id,
      monthlyPremium: { amount: 189_900, currency: 'COP' },
    });
  });

  it('loads the selection persisted by the backend', async () => {
    const result = firstValueFrom(gateway.loadSelection(REQUEST.id));
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
    request.flush({
      solicitudId: REQUEST.id,
      ofertaId: OFFER.id,
      version: OFFER.version,
      nombreOferta: OFFER.nombre,
      primaMensual: OFFER.primaMensual,
      seleccionadaEn: '2026-10-11T18:05:00Z',
    });

    await expect(result).resolves.toMatchObject({
      quoteId: REQUEST.id,
      offerId: OFFER.id,
      offerName: OFFER.nombre,
    });
  });
});

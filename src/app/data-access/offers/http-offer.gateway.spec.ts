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

const REQUEST: QuoteRequestRecord = {
  id: 'AQT-2026-ABCDEF1234',
  productId: 'automotive',
  customerType: 'natural',
  nationalId: '12.345.678-9',
  vehiclePlate: 'ABC123',
  email: 'cliente@solventa.co',
  phone: '+56912345678',
  status: 'received',
  createdAt: '2026-10-11T18:00:00Z',
};

const OFFER = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  nombre: 'Seguro Automotriz Pro',
  descripcion: 'Cobertura extendida',
  primaMensual: { monto: '1.8000', moneda: 'UF' as const },
  coberturaPrincipal: 'Daños propios y terceros',
  deducible: 'UF 3',
  vigencia: 'Anual',
  responsabilidadCivil: 'Hasta UF 1.000',
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
    const request = http.expectOne(`/api/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`);
    expect(request.request.withCredentials).toBe(true);
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
          monthlyPremiumUf: 1.8,
          status: 'available',
        },
      ],
    });
  });

  it('confirms an offer with an idempotency key', async () => {
    const result = firstValueFrom(gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version));
    const request = http.expectOne(`/api/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
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
      monthlyPremiumUf: 1.8,
    });
  });

  it('loads the selection persisted by the backend', async () => {
    const result = firstValueFrom(gateway.loadSelection(REQUEST.id));
    const request = http.expectOne(`/api/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
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

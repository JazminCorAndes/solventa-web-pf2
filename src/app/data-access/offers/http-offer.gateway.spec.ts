import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PREMIUM_PERIODICITIES } from '../../core/offers/offer.models';
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

const CALCULATION_RESPONSE = {
  solicitudId: REQUEST.id,
  calculadaEn: '2026-10-11T18:00:00Z',
  vigenteHasta: '2026-10-26T18:00:00Z',
  tasaAplicada: 'Estándar',
  ofertas: [OFFER],
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

  it('maps an accepted offer returned by the backend', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
      .flush({ ...CALCULATION_RESPONSE, ofertas: [{ ...OFFER, estado: 'aceptada' }] });

    await expect(result).resolves.toMatchObject({
      offers: [{ id: OFFER.id, status: 'accepted' }],
    });
  });

  it('loads and maps offers from the latest quote request', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`,
    );
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
          premium: { amount: 189_900, currency: 'COP' },
          periodicity: 'mensual',
          status: 'available',
        },
      ],
    });
  });

  it('confirms an offer with an idempotency key', async () => {
    const result = firstValueFrom(gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ ofertaId: OFFER.id, version: OFFER.version });
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
      premium: { amount: 189_900, currency: 'COP' },
      periodicity: 'mensual',
      confirmed: true,
    });
  });

  it('loads the selection persisted by the backend', async () => {
    const result = firstValueFrom(gateway.loadSelection(REQUEST.id));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`,
    );
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
      premium: { amount: 189_900, currency: 'COP' },
      periodicity: 'mensual',
      confirmed: true,
    });
  });

  it.each(PREMIUM_PERIODICITIES)(
    'normaliza una prima %s sin fabricar mensualidades',
    async (periodicity) => {
      const result = firstValueFrom(gateway.loadOffers());
      const request = http.expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`,
      );
      const premium = { monto: '48000', moneda: 'COP' };
      request.flush({
        ...CALCULATION_RESPONSE,
        ofertas: [
          {
            ...OFFER,
            prima: premium,
            periodicidad: periodicity,
            primaMensual: periodicity === 'mensual' ? premium : null,
          },
        ],
      });

      const calculation = await result;
      expect(calculation.offers[0].premium).toEqual({ amount: 48_000, currency: 'COP' });
      expect(calculation.offers[0].periodicity).toBe(periodicity);
      expect(calculation.offers[0]).not.toHaveProperty('monthlyPremium');
    },
  );

  it.each(
    PREMIUM_PERIODICITIES.flatMap((periodicity) => [
      { periodicity, method: 'GET' },
      { periodicity, method: 'PUT' },
    ]),
  )(
    'conserva prima y periodicidad en selección $method $periodicity',
    async ({ periodicity, method }) => {
      const result = firstValueFrom(
        method === 'GET'
          ? gateway.loadSelection(REQUEST.id)
          : gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version),
      );
      const request = http.expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`,
      );
      expect(request.request.method).toBe(method);
      if (method === 'PUT') {
        expect(request.request.body).toEqual({ ofertaId: OFFER.id, version: OFFER.version });
      }
      const premium = { monto: '48000', moneda: 'COP' };
      request.flush({
        solicitudId: REQUEST.id,
        ofertaId: OFFER.id,
        version: OFFER.version,
        nombreOferta: OFFER.nombre,
        prima: premium,
        periodicidad: periodicity,
        primaMensual: periodicity === 'mensual' ? premium : null,
        seleccionadaEn: '2026-10-11T18:05:00Z',
      });

      await expect(result).resolves.toMatchObject({
        offerId: OFFER.id,
        premium: { amount: 48_000, currency: 'COP' },
        periodicity,
      });
    },
  );

  it.each([
    { name: 'prima nueva sin periodicidad', fields: { prima: OFFER.primaMensual } },
    { name: 'periodicidad nueva sin prima', fields: { periodicidad: 'por_viaje' } },
    { name: 'prima nueva nula', fields: { prima: null, periodicidad: 'por_vuelo' } },
    {
      name: 'periodicidad desconocida',
      fields: { prima: OFFER.primaMensual, periodicidad: 'diaria' },
    },
    { name: 'prima mensual legada nula', fields: { primaMensual: null } },
  ])('rechaza $name sin recurrir a una prima mensual', async ({ fields }) => {
    const result = firstValueFrom(gateway.loadOffers());
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
      .flush({
        ...CALCULATION_RESPONSE,
        ofertas: [{ ...OFFER, ...fields }],
      });

    await expect(result).rejects.toThrow(/premium|monetary/);
  });

  it('conserva la moneda de la prima nueva en lugar de usar la del alias legado', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
      .flush({
        ...CALCULATION_RESPONSE,
        ofertas: [
          {
            ...OFFER,
            prima: { monto: '99.50', moneda: 'USD' },
            periodicidad: 'por_viaje',
            primaMensual: null,
          },
        ],
      });

    await expect(result).resolves.toMatchObject({
      offers: [{ premium: { amount: 99.5, currency: 'USD' }, periodicity: 'por_viaje' }],
    });
  });
});

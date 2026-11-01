import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PREMIUM_PERIODICITIES } from '../../core/offers/offer.models';
import { OfferSelectionChangedError, OfferUnavailableError } from '../../core/offers/offer.errors';
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
  prima: { monto: '189900', moneda: 'COP' },
  periodicidad: 'mensual',
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
const SELECTION_RESPONSE = {
  solicitudId: REQUEST.id,
  ofertaId: OFFER.id,
  version: OFFER.version,
  nombreOferta: OFFER.nombre,
  prima: OFFER.prima,
  periodicidad: OFFER.periodicidad,
  primaMensual: OFFER.primaMensual,
  seleccionadaEn: '2026-10-11T18:05:00Z',
};
const PROVISIONAL_RESPONSE = {
  ...SELECTION_RESPONSE,
  revision: 1,
  vigenteHasta: '2030-01-01T00:00:00Z',
};
const PROVISIONAL_COMMAND = {
  quoteId: REQUEST.id,
  offerId: OFFER.id,
  offerVersion: OFFER.version,
  expectedRevision: 0,
  idempotencyKey: '20000000-0000-4000-8000-000000000001',
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

  it('sends the provisional revision and caller-owned idempotency key without accepting', async () => {
    const result = firstValueFrom(gateway.saveProvisionalSelection(PROVISIONAL_COMMAND));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      ofertaId: OFFER.id,
      version: OFFER.version,
      revisionEsperada: 0,
    });
    expect(request.request.headers.get('Idempotency-Key')).toBe(PROVISIONAL_COMMAND.idempotencyKey);
    request.flush(PROVISIONAL_RESPONSE);
    await expect(result).resolves.toMatchObject({
      confirmed: false,
      revision: 1,
      validUntil: PROVISIONAL_RESPONSE.vigenteHasta,
      premium: { amount: 189_900, currency: 'COP' },
      periodicity: 'mensual',
    });
    http.expectNone(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
  });

  it('sends the reviewed provisional revision only on explicit acceptance', async () => {
    const result = firstValueFrom(gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version, 2));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`,
    );
    expect(request.request.body).toEqual({
      ofertaId: OFFER.id,
      version: OFFER.version,
      revisionSeleccion: 2,
    });
    request.flush(SELECTION_RESPONSE);
    await expect(result).resolves.toMatchObject({ confirmed: true, offerId: OFFER.id });
  });

  it.each([false, true])(
    'recovers terminal acceptance with provisional=%s',
    async (provisional) => {
      const result = firstValueFrom(gateway.loadSelectionState(REQUEST.id));
      http
        .expectOne(
          `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
        )
        .flush({
          solicitudId: REQUEST.id,
          seleccion: provisional ? PROVISIONAL_RESPONSE : null,
          aceptacion: SELECTION_RESPONSE,
          estadoOferta: provisional ? 'aceptada' : null,
        });
      const state = await result;
      expect(state.acceptance?.confirmed).toBe(true);
      expect(state.acceptance?.offerId).toBe(OFFER.id);
      expect(state.selection?.confirmed ?? null).toBe(provisional ? false : null);
      expect(state.offerStatus).toBe(provisional ? 'accepted' : null);
    },
  );

  it('keeps an empty canonical state distinct from a missing backend route', async () => {
    const url = `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`;
    const empty = firstValueFrom(gateway.loadSelectionState(REQUEST.id));
    http.expectOne(url).flush({
      solicitudId: REQUEST.id,
      seleccion: null,
      aceptacion: null,
      estadoOferta: null,
    });
    await expect(empty).resolves.toEqual({
      quoteId: REQUEST.id,
      selection: null,
      acceptance: null,
      offerStatus: null,
    });
    const unavailable = firstValueFrom(gateway.loadSelectionState(REQUEST.id));
    const assertion = expect(unavailable).rejects.toMatchObject({ status: 404 });
    http.expectOne(url).flush({}, { status: 404, statusText: 'Not Found' });
    await assertion;
    http.expectNone(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`);
  });

  it.each([
    { revision: 0 },
    { revision: null },
    { revision: '1' },
    { revision: true },
    { vigenteHasta: null },
    { vigenteHasta: 'invalid' },
    { vigenteHasta: '2030-01-01T00:00:00+00:00' },
    { solicitudId: 'another-quote' },
    { ofertaId: 'another-offer' },
    { version: 2 },
  ])('rejects invalid provisional metadata or a mismatched receipt: %j', async (fields) => {
    const result = firstValueFrom(gateway.saveProvisionalSelection(PROVISIONAL_COMMAND));
    const assertion = expect(result).rejects.toThrow();
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
      )
      .flush({ ...PROVISIONAL_RESPONSE, ...fields });
    await assertion;
  });

  it.each([
    { solicitudId: 'another-quote', seleccion: null, aceptacion: null, estadoOferta: null },
    {
      solicitudId: REQUEST.id,
      seleccion: PROVISIONAL_RESPONSE,
      aceptacion: null,
      estadoOferta: null,
    },
    {
      solicitudId: REQUEST.id,
      seleccion: PROVISIONAL_RESPONSE,
      aceptacion: null,
      estadoOferta: 'aceptada',
    },
    {
      solicitudId: REQUEST.id,
      seleccion: PROVISIONAL_RESPONSE,
      aceptacion: SELECTION_RESPONSE,
      estadoOferta: 'disponible',
    },
  ])('rejects an inconsistent canonical response: %j', async (response) => {
    const result = firstValueFrom(gateway.loadSelectionState(REQUEST.id));
    const assertion = expect(result).rejects.toThrow();
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
      )
      .flush(response);
    await assertion;
  });

  it.each([
    { status: 409, code: 'seleccion_desactualizada', expected: OfferSelectionChangedError },
    { status: 409, code: 'seleccion_no_modificable', expected: OfferSelectionChangedError },
    { status: 422, code: 'oferta_no_disponible', expected: OfferUnavailableError },
  ])('maps controlled $code without inventing success', async ({ status, code, expected }) => {
    const result = firstValueFrom(gateway.saveProvisionalSelection(PROVISIONAL_COMMAND));
    const assertion = expect(result).rejects.toBeInstanceOf(expected);
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
      )
      .flush({ code }, { status, statusText: 'Error' });
    await assertion;
  });

  it('preserves an idempotency conflict instead of treating it as a valid selection', async () => {
    const result = firstValueFrom(gateway.saveProvisionalSelection(PROVISIONAL_COMMAND));
    const assertion = expect(result).rejects.toMatchObject({
      status: 409,
      error: { code: 'conflicto_idempotencia' },
    });
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion-provisional`,
      )
      .flush({ code: 'conflicto_idempotencia' }, { status: 409, statusText: 'Conflict' });
    await assertion;
  });

  it('maps an accepted offer returned by the backend', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
      .flush({ ...CALCULATION_RESPONSE, ofertas: [{ ...OFFER, estado: 'aceptada' }] });

    await expect(result).resolves.toMatchObject({
      offers: [{ id: OFFER.id, status: 'accepted' }],
    });
  });

  it.each([
    [403, 'consentimiento_no_vigente'],
    [422, 'perfil_vencido'],
    [503, 'perfilamiento_no_disponible'],
  ])('conserva el error de perfilamiento al seleccionar %s', async (status, code) => {
    const result = firstValueFrom(gateway.confirmSelection(REQUEST.id, OFFER.id, OFFER.version));
    const assertion = expect(result).rejects.toMatchObject({ status, error: { code } });
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/seleccion`)
      .flush({ code }, { status, statusText: 'Error' });
    await assertion;
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
      prima: OFFER.prima,
      periodicidad: OFFER.periodicidad,
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
      prima: OFFER.prima,
      periodicidad: OFFER.periodicidad,
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
    { name: 'prima nueva sin periodicidad', fields: { periodicidad: undefined } },
    {
      name: 'periodicidad nueva sin prima',
      fields: { prima: undefined, periodicidad: 'por_viaje' },
    },
    { name: 'prima nueva nula', fields: { prima: null, periodicidad: 'por_vuelo' } },
    {
      name: 'periodicidad desconocida',
      fields: { prima: OFFER.primaMensual, periodicidad: 'diaria' },
    },
    { name: 'solo prima mensual legada', fields: { prima: undefined, periodicidad: undefined } },
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

  it.each(['', ' ', '-1', 'NaN', 'Infinity', '1e3', '0x10'])(
    'rejects an invalid decimal amount %j',
    async (amount) => {
      const result = firstValueFrom(gateway.loadOffers());
      http
        .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
        .flush({
          ...CALCULATION_RESPONSE,
          ofertas: [{ ...OFFER, prima: { monto: amount, moneda: 'COP' } }],
        });
      await expect(result).rejects.toThrow(/monetary/);
    },
  );

  it('rejects an unknown offer status', async () => {
    const result = firstValueFrom(gateway.loadOffers());
    http
      .expectOne(`${environment.apiBaseUrl}/v1/solicitudes-cotizacion/${REQUEST.id}/ofertas`)
      .flush({ ...CALCULATION_RESPONSE, ofertas: [{ ...OFFER, estado: 'desconocido' }] });
    await expect(result).rejects.toThrow(/status/);
  });
});

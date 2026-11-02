import { inject, Injectable } from '@angular/core';
import { defer, delay, map, Observable, of, switchMap, throwError } from 'rxjs';
import { OfferSelectionChangedError, OfferUnavailableError } from '../../core/offers/offer.errors';
import { OfferGateway } from '../../core/offers/offer.gateway';
import {
  InsuranceOffer,
  isProvisionalSelection,
  OfferCalculation,
  OfferSelectionState,
  ProvisionalOfferSelection,
  ProvisionalSelectionRequest,
  SelectedOfferRecord,
} from '../../core/offers/offer.models';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';
import { ACTIVE_MARKET } from '../../core/market/market.config';
import {
  FLIGHT_COVERAGE_TYPES,
  QuoteProductData,
  WEATHER_EVENT_TYPES,
} from '../../core/quotes/quote-request.models';

interface OfferBlueprint {
  key: string;
  name: string;
  description: string;
  premium: number;
  coverage: string;
  deductible: string;
  liability: string;
  coverages: string[];
  conditions: string[];
  benefits: string[];
  validity?: string;
}

const OFFER_BLUEPRINTS: Record<string, OfferBlueprint[]> = {
  automotive: [
    {
      key: 'pro',
      name: 'Seguro Automotriz Pro',
      description: 'Cobertura extendida con beneficios adicionales',
      premium: 189_900,
      coverage: 'Daños propios y terceros',
      deductible: '$500.000 COP',
      liability: 'Hasta $1.000.000.000 COP',
      coverages: ['Daños materiales y pérdida total.', 'Robo, hurto y responsabilidad civil.'],
      conditions: ['Sujeto a inspección técnica previa.'],
      benefits: ['Auto de reemplazo', 'Asistencia en ruta 24/7'],
    },
    {
      key: 'total',
      name: 'Seguro Automotriz Total',
      description: 'Protección integral para tu vehículo',
      premium: 149_900,
      coverage: 'Daños, robo y pérdida total',
      deductible: '$1.000.000 COP',
      liability: 'Hasta $750.000.000 COP',
      coverages: ['Daños materiales.', 'Responsabilidad civil.'],
      conditions: ['Vehículos de hasta diez años.'],
      benefits: ['Asistencia en ruta', 'Grúa hasta 100 km'],
    },
    {
      key: 'base',
      name: 'Seguro Automotriz Base',
      description: 'Cobertura esencial para terceros',
      premium: 99_900,
      coverage: 'Responsabilidad civil',
      deductible: '$1.500.000 COP',
      liability: 'Hasta $500.000.000 COP',
      coverages: ['Daños a terceros.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Orientación legal'],
    },
  ],
  travel: [
    {
      key: 'global',
      name: 'Viaje Global',
      description: 'Protección internacional de alta cobertura',
      premium: 89_900,
      coverage: 'Emergencias médicas y cancelación',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Emergencias médicas.', 'Cancelación y equipaje.'],
      conditions: ['Válido durante las fechas declaradas.'],
      benefits: ['Asistencia internacional 24/7'],
      validity: 'Duración del viaje',
    },
    {
      key: 'plus',
      name: 'Viaje Plus',
      description: 'Cobertura médica y asistencia para tu viaje',
      premium: 59_900,
      coverage: 'Emergencias médicas',
      deductible: '$100.000 COP',
      liability: 'No aplica',
      coverages: ['Atención médica.', 'Pérdida de equipaje.'],
      conditions: ['Aplica para viajeros residentes en Colombia.'],
      benefits: ['Telemedicina'],
      validity: 'Duración del viaje',
    },
    {
      key: 'esencial',
      name: 'Viaje Esencial',
      description: 'Protección básica para desplazamientos',
      premium: 34_900,
      coverage: 'Urgencias en viaje',
      deductible: '$200.000 COP',
      liability: 'No aplica',
      coverages: ['Urgencias médicas.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Orientación telefónica'],
      validity: 'Duración del viaje',
    },
  ],
  life: [
    {
      key: 'familiar',
      name: 'Vida Familiar',
      description: 'Respaldo amplio para quienes más quieres',
      premium: 54_900,
      coverage: 'Fallecimiento e incapacidad',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Fallecimiento por cualquier causa.', 'Incapacidad total y permanente.'],
      conditions: ['Sujeto a declaración de asegurabilidad.'],
      benefits: ['Asistencia funeraria'],
    },
    {
      key: 'esencial',
      name: 'Vida Esencial',
      description: 'Protección accesible para tu familia',
      premium: 29_900,
      coverage: 'Fallecimiento',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Fallecimiento por cualquier causa.'],
      conditions: ['Edad de ingreso según condiciones.'],
      benefits: ['Orientación legal'],
    },
    {
      key: 'basico',
      name: 'Vida Básica',
      description: 'Respaldo económico fundamental',
      premium: 19_900,
      coverage: 'Muerte accidental',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Muerte accidental.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Línea de asistencia'],
    },
  ],
  'device-protection': [
    {
      key: 'total',
      name: 'Dispositivo Total',
      description: 'Daño accidental, hurto y fallas',
      premium: 45_900,
      coverage: 'Daño y hurto',
      deductible: '10% del valor del equipo',
      liability: 'No aplica',
      coverages: ['Daño accidental.', 'Hurto calificado.', 'Falla posterior a la garantía.'],
      conditions: ['Equipo en buen estado al ingresar.'],
      benefits: ['Recogida y entrega'],
    },
    {
      key: 'plus',
      name: 'Dispositivo Plus',
      description: 'Protección para accidentes y fallas',
      premium: 29_900,
      coverage: 'Daño accidental',
      deductible: '15% del valor del equipo',
      liability: 'No aplica',
      coverages: ['Daño accidental.', 'Fallas eléctricas.'],
      conditions: ['Se requiere factura de compra.'],
      benefits: ['Diagnóstico sin costo'],
    },
    {
      key: 'pantalla',
      name: 'Pantalla Segura',
      description: 'Cobertura esencial para la pantalla',
      premium: 14_900,
      coverage: 'Rotura de pantalla',
      deductible: '20% del valor de reparación',
      liability: 'No aplica',
      coverages: ['Rotura accidental de pantalla.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Red de servicio autorizada'],
    },
  ],
  parametric: [
    {
      key: 'puntual',
      name: 'Vuelo Puntual Plus',
      description: 'Compensación amplia por retraso o cancelación',
      premium: 39_900,
      coverage: 'Retraso desde 3 horas y cancelación',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Pago por retraso.', 'Pago por cancelación.'],
      conditions: ['Activación con datos oficiales de la aerolínea.'],
      benefits: ['Pago automático'],
      validity: 'Fecha del vuelo',
    },
    {
      key: 'demora',
      name: 'Vuelo Protegido',
      description: 'Compensación ante demoras significativas',
      premium: 24_900,
      coverage: 'Retraso desde 4 horas',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Pago fijo por retraso.'],
      conditions: ['El vuelo debe estar confirmado.'],
      benefits: ['Notificación en tiempo real'],
      validity: 'Fecha del vuelo',
    },
    {
      key: 'basico',
      name: 'Vuelo Básico',
      description: 'Cobertura por cancelación del vuelo',
      premium: 14_900,
      coverage: 'Cancelación',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Pago fijo por cancelación.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Gestión digital'],
      validity: 'Fecha del vuelo',
    },
  ],
  'parametric-weather': [
    {
      key: 'integral',
      name: 'Clima Integral',
      description: 'Protección paramétrica para el evento y lugar declarados',
      premium: 59_900,
      coverage: 'Evento climático declarado',
      deductible: 'Según condiciones del plan',
      liability: 'Valor asegurado declarado',
      coverages: ['Compensación sujeta al evento y umbral definidos en el plan.'],
      conditions: ['El umbral y la fuente de verificación se especifican antes de la aceptación.'],
      benefits: ['Consulta digital del plan'],
    },
    {
      key: 'plus',
      name: 'Clima Plus',
      description: 'Respaldo ante eventos climáticos durante el periodo declarado',
      premium: 39_900,
      coverage: 'Evento climático declarado',
      deductible: 'Según condiciones del plan',
      liability: 'Valor asegurado declarado',
      coverages: ['Compensación sujeta al evento y umbral definidos en el plan.'],
      conditions: ['El umbral y la fuente de verificación se especifican antes de la aceptación.'],
      benefits: ['Orientación sobre la cobertura'],
    },
    {
      key: 'esencial',
      name: 'Clima Esencial',
      description: 'Cobertura climática básica para el lugar asegurado',
      premium: 24_900,
      coverage: 'Evento climático declarado',
      deductible: 'Según condiciones del plan',
      liability: 'Valor asegurado declarado',
      coverages: ['Compensación sujeta al evento y umbral definidos en el plan.'],
      conditions: ['El umbral y la fuente de verificación se especifican antes de la aceptación.'],
      benefits: ['Gestión digital'],
    },
  ],
  'payment-protection': [
    {
      key: 'integral',
      name: 'Pagos Integral',
      description: 'Respaldo de cuotas ante desempleo e incapacidad',
      premium: 49_900,
      coverage: 'Hasta 6 cuotas',
      deductible: '30 días de carencia',
      liability: 'No aplica',
      coverages: ['Desempleo involuntario.', 'Incapacidad temporal.'],
      conditions: ['Crédito al día al momento del evento.'],
      benefits: ['Orientación laboral'],
    },
    {
      key: 'plus',
      name: 'Pagos Plus',
      description: 'Protección de tus obligaciones financieras',
      premium: 34_900,
      coverage: 'Hasta 4 cuotas',
      deductible: '30 días de carencia',
      liability: 'No aplica',
      coverages: ['Desempleo involuntario.'],
      conditions: ['Contrato laboral vigente al ingreso.'],
      benefits: ['Acompañamiento financiero'],
    },
    {
      key: 'esencial',
      name: 'Pagos Esencial',
      description: 'Cobertura básica de cuotas',
      premium: 19_900,
      coverage: 'Hasta 2 cuotas',
      deductible: '60 días de carencia',
      liability: 'No aplica',
      coverages: ['Incapacidad temporal.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Educación financiera'],
    },
  ],
  'mortgage-life': [
    {
      key: 'integral',
      name: 'Vida Hipotecaria Integral',
      description: 'Protección del saldo y respaldo familiar',
      premium: 119_900,
      coverage: 'Saldo insoluto e incapacidad',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Fallecimiento.', 'Incapacidad total y permanente.'],
      conditions: ['Sujeto a evaluación de asegurabilidad.'],
      benefits: ['Asistencia funeraria'],
    },
    {
      key: 'saldo',
      name: 'Vida Hipotecaria Saldo',
      description: 'Cobertura del saldo pendiente del crédito',
      premium: 89_900,
      coverage: 'Saldo insoluto',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Fallecimiento por cualquier causa.'],
      conditions: ['Crédito hipotecario vigente.'],
      benefits: ['Gestión directa con la entidad'],
    },
    {
      key: 'esencial',
      name: 'Vida Hipotecaria Esencial',
      description: 'Protección hipotecaria básica',
      premium: 64_900,
      coverage: 'Fallecimiento accidental',
      deductible: 'Sin deducible',
      liability: 'No aplica',
      coverages: ['Fallecimiento accidental.'],
      conditions: ['Oferta válida hasta la fecha indicada.'],
      benefits: ['Orientación sucesoral'],
    },
  ],
};

// Trabajo en proceso ... :) Conectar la tarificación; estos planes usan precios locales.
function offersFor(productId: string, productData: QuoteProductData): InsuranceOffer[] {
  const blueprints = OFFER_BLUEPRINTS[productId];
  if (!blueprints) {
    throw new OfferUnavailableError();
  }
  return blueprints.map((blueprint, index) => {
    const details = { ...blueprint };
    if (productId === 'parametric') {
      const coverage = productData['coverageType'] ?? 'delay-cancellation';
      if (!FLIGHT_COVERAGE_TYPES.some((value) => value === coverage)) {
        throw new OfferUnavailableError();
      }
      if (coverage !== 'delay-cancellation') {
        const missedConnection = 'Pérdida de conexión por causas cubiertas.';
        details.coverage =
          coverage === 'comprehensive'
            ? 'Retraso, cancelación y pérdida de conexión'
            : 'Pérdida de conexión';
        details.coverages =
          coverage === 'comprehensive'
            ? ['Retraso del vuelo.', 'Cancelación del vuelo.', missedConnection]
            : [missedConnection];
        details.conditions = ['Sujeto a las causas, tiempos de conexión y exclusiones del plan.'];
        details.description = `Protección para ${details.coverage.toLocaleLowerCase('es-CO')}`;
        details.benefits = ['Gestión digital de la cobertura'];
      }
    }
    if (productId === 'parametric-weather') {
      if (!WEATHER_EVENT_TYPES.some((value) => value === productData['weatherEvent'])) {
        throw new OfferUnavailableError();
      }
      const event = productData['weatherEvent'] === 'drought' ? 'Sequía' : 'Lluvia intensa';
      details.coverage = event;
      details.coverages = [`${event} en ${productData['location']}.`];
      details.liability = `Hasta ${new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(Number(productData['insuredAmount']))} COP`;
      details.validity = `${productData['startDate']} a ${productData['endDate']}`;
    }
    return {
      id: `${productId}-${blueprint.key}`,
      version: 1,
      name: details.name,
      description: details.description,
      premium: { amount: blueprint.premium, currency: ACTIVE_MARKET.currency },
      periodicity:
        productId === 'travel'
          ? 'por_viaje'
          : productId === 'parametric'
            ? 'por_vuelo'
            : productId === 'parametric-weather'
              ? 'por_periodo'
              : 'mensual',
      coverageLabel: details.coverage,
      deductibleLabel: details.deductible,
      validityLabel: details.validity ?? 'Anual',
      liabilityLabel: details.liability,
      coverages: details.coverages,
      conditions: details.conditions,
      additionalBenefits: details.benefits,
      recommended: index === 0,
      status: 'available',
      validUntil: '2027-12-31T23:59:59.000Z',
    };
  });
}

@Injectable()
export class MockOfferGateway implements OfferGateway {
  private readonly quoteRequestStorage = inject(QUOTE_REQUEST_STORAGE);
  private readonly selectionStorage = inject(OFFER_SELECTION_STORAGE);
  private readonly profiling = inject(MockProfilingGateway);
  private readonly provisionals = new Map<string, ProvisionalOfferSelection>();
  private readonly acceptances = new Map<string, SelectedOfferRecord>();
  private readonly receipts = new Map<
    string,
    { fingerprint: string; selection: ProvisionalOfferSelection }
  >();

  constructor() {
    const stored = this.selectionStorage.read();
    if (stored?.confirmed) {
      this.acceptances.set(stored.quoteId, stored);
    } else if (stored && isProvisionalSelection(stored)) {
      this.provisionals.set(stored.quoteId, stored);
    }
  }

  loadOffers(): Observable<OfferCalculation> {
    const request = this.quoteRequestStorage.read();
    if (!request) {
      return throwError(() => new OfferUnavailableError());
    }
    return of(request).pipe(
      delay(450),
      switchMap((record) => this.profiling.loadProfile(record.id).pipe(map(() => record))),
      map((record): OfferCalculation => {
        const selection = this.acceptances.get(record.id) ?? this.selectionStorage.read();
        return {
          quoteId: record.id,
          calculatedAt: new Date().toISOString(),
          validUntil: '2027-12-31T23:59:59.000Z',
          appliedRate: 'Tarifa del plan',
          offers: offersFor(record.productId, record.productData).map((offer) =>
            selection?.confirmed &&
            selection.quoteId === record.id &&
            selection.offerId === offer.id
              ? { ...offer, status: 'accepted' as const }
              : offer,
          ),
        };
      }),
    );
  }

  loadSelection(
    quoteId = this.quoteRequestStorage.read()?.id ?? '',
  ): Observable<SelectedOfferRecord | null> {
    return this.loadSelectionState(quoteId).pipe(map((state) => state.acceptance));
  }

  loadSelectionState(quoteId: string): Observable<OfferSelectionState> {
    return defer(() => {
      const request = this.quoteRequestStorage.read();
      if (!request || request.id !== quoteId) {
        throw new OfferUnavailableError();
      }
      const stored = this.selectionStorage.read();
      const current = stored?.quoteId === quoteId ? stored : null;
      const selection =
        this.provisionals.get(quoteId) ??
        (current && isProvisionalSelection(current) ? current : null);
      if (selection) {
        this.provisionals.set(quoteId, selection);
      }
      const acceptance = this.acceptances.get(quoteId) ?? (current?.confirmed ? current : null);
      if (acceptance) {
        this.acceptances.set(quoteId, acceptance);
      }
      const offer = selection
        ? offersFor(request.productId, request.productData).find(
            (item) => item.id === selection.offerId && item.version === selection.offerVersion,
          )
        : null;
      return of({
        quoteId,
        selection,
        acceptance,
        offerStatus: !selection
          ? null
          : acceptance
            ? ('accepted' as const)
            : !offer
              ? ('withdrawn' as const)
              : Date.parse(selection.validUntil) <= Date.now()
                ? ('expired' as const)
                : offer.status,
      });
    });
  }

  saveProvisionalSelection(
    command: ProvisionalSelectionRequest,
  ): Observable<ProvisionalOfferSelection> {
    return defer(() => {
      if (this.quoteRequestStorage.read()?.id !== command.quoteId) {
        throw new OfferUnavailableError();
      }
      const key = `${command.quoteId}:${command.idempotencyKey}`;
      const fingerprint = JSON.stringify([
        command.quoteId,
        command.offerId,
        command.offerVersion,
        command.expectedRevision,
      ]);
      const receipt = this.receipts.get(key);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) {
          throw new Error('The idempotency key belongs to a different provisional selection.');
        }
        return of(structuredClone(receipt.selection));
      }
      return this.loadSelectionState(command.quoteId).pipe(
        switchMap((state) => {
          if (state.acceptance || command.expectedRevision !== (state.selection?.revision ?? 0)) {
            throw new OfferSelectionChangedError();
          }
          return this.profiling.loadProfile(command.quoteId);
        }),
        map(() => {
          const concurrentReceipt = this.receipts.get(key);
          if (concurrentReceipt) {
            if (concurrentReceipt.fingerprint !== fingerprint) {
              throw new Error('The idempotency key belongs to a different provisional selection.');
            }
            return structuredClone(concurrentReceipt.selection);
          }
          const accepted = this.acceptances.get(command.quoteId) ?? this.selectionStorage.read();
          if (
            (accepted?.quoteId === command.quoteId && accepted.confirmed) ||
            (this.provisionals.get(command.quoteId)?.revision ?? 0) !== command.expectedRevision
          ) {
            throw new OfferSelectionChangedError();
          }
          const offer = this.currentOffer(command.quoteId, command.offerId, command.offerVersion);
          const selection: ProvisionalOfferSelection = {
            quoteId: command.quoteId,
            offerId: offer.id,
            offerVersion: offer.version,
            offerName: offer.name,
            premium: offer.premium,
            periodicity: offer.periodicity,
            selectedAt: new Date().toISOString(),
            confirmed: false,
            revision: command.expectedRevision + 1,
            validUntil: offer.validUntil,
          };
          this.provisionals.set(command.quoteId, selection);
          this.receipts.set(key, { fingerprint, selection: structuredClone(selection) });
          this.selectionStorage.write(selection);
          return selection;
        }),
      );
    });
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
    selectionRevision?: number,
  ): Observable<SelectedOfferRecord> {
    return of(null).pipe(
      delay(350),
      switchMap(() => this.loadSelectionState(quoteId)),
      switchMap((state) => {
        if (
          state.selection &&
          (state.selection.offerId !== offerId ||
            state.selection.offerVersion !== offerVersion ||
            state.selection.revision !== selectionRevision)
        ) {
          throw new OfferSelectionChangedError();
        }
        if (state.acceptance) {
          if (
            state.acceptance.offerId !== offerId ||
            state.acceptance.offerVersion !== offerVersion
          ) {
            throw new OfferUnavailableError();
          }
          return of(state.acceptance);
        }
        return this.profiling.loadProfile(quoteId).pipe(
          map(() => {
            const current = this.provisionals.get(quoteId);
            if (
              current &&
              (current.offerId !== offerId ||
                current.offerVersion !== offerVersion ||
                current.revision !== selectionRevision)
            ) {
              throw new OfferSelectionChangedError();
            }
            const offer = this.currentOffer(quoteId, offerId, offerVersion);
            const acceptance: SelectedOfferRecord = {
              quoteId,
              offerId,
              offerVersion,
              offerName: offer.name,
              premium: offer.premium,
              periodicity: offer.periodicity,
              selectedAt: new Date().toISOString(),
              confirmed: true,
            };
            this.selectionStorage.write(acceptance);
            this.acceptances.set(quoteId, acceptance);
            return acceptance;
          }),
        );
      }),
    );
  }

  private currentOffer(quoteId: string, offerId: string, version: number): InsuranceOffer {
    const request = this.quoteRequestStorage.read();
    const offer =
      request?.id === quoteId
        ? offersFor(request.productId, request.productData).find(
            (candidateOffer) => candidateOffer.id === offerId,
          )
        : undefined;
    if (
      !offer ||
      offer.version !== version ||
      offer.status !== 'available' ||
      Date.parse(offer.validUntil) <= Date.now()
    ) {
      throw new OfferUnavailableError();
    }
    return offer;
  }
}

import { inject, Injectable } from '@angular/core';
import { delay, map, Observable, of, switchMap, throwError } from 'rxjs';
import { OfferUnavailableError } from '../../core/offers/offer.errors';
import { OfferGateway } from '../../core/offers/offer.gateway';
import {
  InsuranceOffer,
  OfferCalculation,
  SelectedOfferRecord,
} from '../../core/offers/offer.models';
import { QUOTE_REQUEST_STORAGE } from '../../core/quotes/quote-request-storage.service';
import { OFFER_SELECTION_STORAGE } from '../../core/offers/offer-selection-storage.service';
import { MockProfilingGateway } from '../profiling/mock-profiling.gateway';
import { ProfilingError } from '../../core/profiling/profiling.errors';

const OFFERS: InsuranceOffer[] = [
  {
    id: 'auto-pro',
    version: 3,
    name: 'Seguro Automotriz Pro',
    description: 'Cobertura extendida con beneficios premium',
    monthlyPremium: 1.8,
    currency: 'UF',
    coverageLabel: 'Daños propios y terceros',
    deductibleLabel: 'UF 3 (Bajo)',
    validityLabel: 'Anual (Renovación automática)',
    liabilityLabel: 'Hasta UF 1.000',
    coverages: [
      'Daños materiales, robo, hurto o uso no autorizado.',
      'Responsabilidad civil y defensa jurídica.',
      'Asistencia en ruta las 24 horas.',
    ],
    conditions: [
      'Sujeto a inspección técnica previa del vehículo.',
      'Deducible aplicable de UF 3 por evento.',
    ],
    additionalBenefits: ['Auto de reemplazo', 'Asistencia en ruta 24/7', 'Defensa jurídica'],
    recommended: true,
    status: 'available',
    validUntil: '2027-12-31T23:59:59.000Z',
  },
  {
    id: 'auto-total',
    version: 2,
    name: 'Seguro Automotriz Total',
    description: 'Protección integral para tu vehículo',
    monthlyPremium: 1.45,
    currency: 'UF',
    coverageLabel: 'Daños, robo y pérdida total',
    deductibleLabel: 'UF 5 (Medio)',
    validityLabel: 'Anual',
    liabilityLabel: 'Hasta UF 750',
    coverages: [
      'Daños materiales y pérdida total.',
      'Robo, hurto y responsabilidad civil.',
      'Asistencia en ruta en todo el país.',
    ],
    conditions: [
      'Vehículos de hasta diez años de antigüedad.',
      'Deducible aplicable de UF 5 por evento.',
    ],
    additionalBenefits: ['Asistencia en ruta', 'Grúa hasta 100 km'],
    recommended: false,
    status: 'available',
    validUntil: '2027-12-31T23:59:59.000Z',
  },
  {
    id: 'auto-base',
    version: 1,
    name: 'Seguro Automotriz Base',
    description: 'Cobertura esencial para terceros',
    monthlyPremium: 0.95,
    currency: 'UF',
    coverageLabel: 'Responsabilidad civil',
    deductibleLabel: 'UF 8 (Alto)',
    validityLabel: 'Oferta vencida',
    liabilityLabel: 'Hasta UF 500',
    coverages: ['Responsabilidad civil por daños a terceros.'],
    conditions: ['Oferta válida hasta la fecha indicada.'],
    additionalBenefits: ['Orientación legal'],
    recommended: false,
    status: 'expired',
    validUntil: '2025-01-01T00:00:00.000Z',
  },
];

const CALCULATION: OfferCalculation = {
  quoteId: 'AQT-2026-8921',
  calculatedAt: '2026-10-11T04:30:00.000Z',
  validUntil: '2027-12-31T23:59:59.000Z',
  appliedRate: 'Estándar (Risk A)',
  offers: OFFERS,
};

@Injectable()
export class MockOfferGateway implements OfferGateway {
  private readonly quoteRequestStorage = inject(QUOTE_REQUEST_STORAGE);
  private readonly selectionStorage = inject(OFFER_SELECTION_STORAGE);
  private readonly profiling = inject(MockProfilingGateway);

  loadOffers(): Observable<OfferCalculation> {
    const request = this.quoteRequestStorage.read();
    if (!request) {
      return throwError(() => new ProfilingError('solicitud_no_encontrada'));
    }
    return of(null).pipe(
      delay(450),
      switchMap(() => this.profiling.loadProfile(request.id)),
      map((profile) => ({
        ...CALCULATION,
        quoteId: request.id,
        calculatedAt: profile.calculadoEn,
        validUntil: profile.vigenteHasta,
        appliedRate: `Simulada (${profile.nivel})`,
      })),
    );
  }

  loadSelection(): Observable<SelectedOfferRecord | null> {
    return of(this.selectionStorage.read());
  }

  confirmSelection(
    quoteId: string,
    offerId: string,
    offerVersion: number,
  ): Observable<SelectedOfferRecord> {
    return of(null).pipe(
      delay(350),
      switchMap(() => this.profiling.loadProfile(quoteId)),
      map(() => {
        const offer = OFFERS.find((item) => item.id === offerId);
        if (
          !offer ||
          offer.version !== offerVersion ||
          offer.status !== 'available' ||
          Date.parse(offer.validUntil) <= Date.now()
        ) {
          throw new OfferUnavailableError();
        }

        return {
          quoteId,
          offerId,
          offerVersion,
          offerName: offer.name,
          monthlyPremium: offer.monthlyPremium,
          currency: offer.currency,
          selectedAt: new Date().toISOString(),
        };
      }),
    );
  }
}

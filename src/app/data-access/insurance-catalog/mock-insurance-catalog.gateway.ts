import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { InsuranceCatalogGateway } from '../../core/insurance-catalog/insurance-catalog.gateway';
import {
  InsuranceProductDetail,
  InsuranceProductSummary,
} from '../../core/insurance-catalog/insurance-catalog.models';

const PRODUCTS: InsuranceProductDetail[] = [
  product(
    'automotive',
    'Seguro Automotriz Total',
    'Protección para tu vehículo, ocupantes y terceros.',
    [
      ['Daños al vehículo', 'Protección ante daños accidentales del vehículo asegurado.'],
      ['Responsabilidad civil', 'Respaldo frente a daños causados a terceros.'],
      ['Asistencia en carretera', 'Acompañamiento ante emergencias durante el trayecto.'],
    ],
    ['El vehículo debe cumplir las condiciones de asegurabilidad.'],
    25_000_000,
    500_000,
    'Anual con renovación',
  ),
  product(
    'travel',
    'Seguro de Viaje',
    'Protección para viajes nacionales e internacionales.',
    [
      ['Asistencia médica', 'Atención por accidente o enfermedad durante el viaje.'],
      ['Equipaje', 'Respaldo ante pérdida o demora del equipaje.'],
      ['Demoras y cancelaciones', 'Compensación por eventos que afecten el itinerario.'],
    ],
    ['La cobertura aplica durante las fechas y destinos informados.'],
    200_000_000,
    200_000,
    'Por la duración del viaje',
  ),
  product(
    'life',
    'Microseguro de Vida',
    'Respaldo financiero accesible para ti y tu familia.',
    [
      ['Fallecimiento', 'Respaldo económico para los beneficiarios.'],
      ['Incapacidad total y permanente', 'Protección ante una incapacidad cubierta.'],
    ],
    ['La edad debe encontrarse dentro del rango aceptado.'],
    30_000_000,
    0,
    'Mensual renovable',
  ),
  product(
    'device-protection',
    'Protección de Dispositivos',
    'Cobertura para daños, hurto y fallas de tus dispositivos.',
    [
      ['Daño accidental', 'Reparación o reposición por daños cubiertos.'],
      ['Hurto calificado', 'Respaldo por pérdida bajo las condiciones contratadas.'],
      ['Falla funcional', 'Atención de fallas posteriores a la garantía.'],
    ],
    ['El dispositivo debe identificarse al asegurarlo.'],
    8_000_000,
    300_000,
    'Anual con renovación',
  ),
  product(
    'parametric',
    'Seguro de Vuelos',
    'Compensación automática ante retrasos o cancelaciones de vuelos.',
    [
      ['Retraso de vuelo', 'Compensación cuando se supera el umbral contratado.'],
      ['Cancelación', 'Compensación ante la cancelación de un vuelo cubierto.'],
    ],
    ['El vuelo debe registrarse antes de la salida.'],
    1_500_000,
    0,
    'Por vuelo',
  ),
  product(
    'payment-protection',
    'Protección de Pagos',
    'Respaldo de obligaciones financieras asociadas a créditos.',
    [
      ['Desempleo involuntario', 'Pago temporal de obligaciones cubiertas.'],
      ['Incapacidad temporal', 'Respaldo de cuotas durante una incapacidad.'],
    ],
    ['La obligación debe estar vigente y al día.'],
    12_000_000,
    0,
    'Mensual renovable',
  ),
  product(
    'mortgage-life',
    'Seguro de Vida Hipotecario',
    'Protección personalizada para el saldo de tu crédito de vivienda.',
    [
      ['Fallecimiento', 'Pago del saldo asegurado del crédito hipotecario.'],
      ['Incapacidad total y permanente', 'Protección del saldo ante incapacidad.'],
    ],
    ['La suma asegurada se ajusta al saldo del crédito.'],
    300_000_000,
    0,
    'Durante la vigencia del crédito',
  ),
];

@Injectable()
export class MockInsuranceCatalogGateway implements InsuranceCatalogGateway {
  loadProducts(): Observable<InsuranceProductSummary[]> {
    return of(PRODUCTS.map(toSummary)).pipe(delay(250));
  }

  loadProduct(productId: string): Observable<InsuranceProductDetail | null> {
    return of(PRODUCTS.find((item) => item.id === productId) ?? null).pipe(delay(250));
  }
}

function product(
  id: string,
  name: string,
  description: string,
  coverages: Array<[string, string]>,
  conditions: string[],
  insuredAmount: number,
  deductible: number,
  term: string,
): InsuranceProductDetail {
  return {
    id,
    name,
    description,
    available: true,
    mainCoverages: coverages.map(([coverage]) => coverage),
    coverages: coverages.map(([coverage, detail]) => ({ name: coverage, description: detail })),
    conditions,
    relevantInformation: { insuredAmount, deductible, currency: 'COP', term },
  };
}

function toSummary(productDetail: InsuranceProductDetail): InsuranceProductSummary {
  const { id, name, description, available, mainCoverages } = productDetail;
  return { id, name, description, available, mainCoverages };
}

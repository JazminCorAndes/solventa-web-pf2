import {
  PartnerOfferOption,
  PartnerQuoteResult,
} from '../../app/data-access/quotes/http-partner-quote.gateway';

export function partnerSnapshotResponse(operation: PartnerQuoteResult) {
  const original = operation.oferta;
  return {
    ofertaId: '88888888-8888-4888-8888-888888888888',
    operationId: operation.operationId,
    socioId: operation.socioId,
    clienteId: operation.clienteId,
    productoId: operation.productoId,
    solicitudId: operation.solicitudId,
    cotizacionId: operation.cotizacionId,
    estado: 'vigente' as const,
    calculadaEn: operation.recibidaEn,
    vigenteHasta: original.vigenteHasta,
    decision: {
      hashDecision: original.trazabilidad.hashDecision,
      modelo: original.trazabilidad.modeloPerfilVersion,
      reglaId: original.trazabilidad.reglaId,
      reglaVersion: original.trazabilidad.reglaVersion,
    },
    riesgo: {
      perfilId: original.trazabilidad.perfilId,
      version: original.trazabilidad.perfilVersion,
      modeloVersion: original.trazabilidad.modeloPerfilVersion,
      score: '0.250000',
      nivel: 'A',
      consentimientoId: '99999999-9999-4999-8999-999999999999',
      consentimientoVersion: 1,
      calculadoEn: operation.recibidaEn,
      vigenteHasta: original.vigenteHasta,
      fallbackUsed: false,
    },
    fuentes: original.trazabilidad.fuentes.map((source) => ({
      ...source,
      consultadaEn: operation.recibidaEn,
      vigenteHasta: original.vigenteHasta,
      simulada: true,
      indicadorRiesgo: '0.250000',
    })),
    variables: {
      baseAsegurada: '180000000.00',
      duracion: 12,
      periodicidad: original.periodicidad,
      tasa: '0.006000',
      factorPerfil: '1.000000',
      score: '0.250000',
      moneda: 'COP',
    },
    ofertas: [
      original.id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ].map((ofertaId, index) => ({
      ofertaId,
      version: original.version,
      nombre: index === 0 ? original.nombre : `Plan alternativo ${index}`,
      descripcion: original.descripcion,
      prima: { monto: ['99000.00', '110000.00', '120000.00'][index], moneda: 'COP' },
      periodicidad: original.periodicidad,
      recomendada: index === 0,
      coberturaPrincipal: original.coberturaPrincipal,
      deducible: original.deducible,
      vigencia: original.vigencia,
      coberturas: original.coberturas,
      condiciones: original.condiciones,
      beneficiosAdicionales: original.beneficiosAdicionales,
      factores: original.explicacion.factoresDeterminantes.map((factor, index) => ({
        codigo: `factor-${index}`,
        descripcion: factor.nombre,
        valor: factor.valor,
      })),
    })),
    hashContenido: original.trazabilidad.hashContenido,
  };
}

export function partnerSelectionResponse(
  operation: PartnerQuoteResult,
  offer: PartnerOfferOption,
  revision = 1,
) {
  return {
    solicitudId: operation.solicitudId,
    ofertaId: offer.ofertaId,
    version: offer.version,
    nombreOferta: offer.nombre,
    prima: offer.prima,
    periodicidad: offer.periodicidad,
    primaMensual: offer.periodicidad === 'mensual' ? offer.prima : null,
    seleccionadaEn: new Date().toISOString(),
    revision,
    vigenteHasta: operation.oferta.vigenteHasta,
  };
}

export function partnerEmptySelectionResponse(operation: PartnerQuoteResult) {
  return {
    solicitudId: operation.solicitudId,
    seleccion: null,
    aceptacion: null,
    estadoOferta: null,
  };
}

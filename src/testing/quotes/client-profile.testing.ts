import { ClientQuoteProfile } from '../../app/core/quotes/quote-request.models';

export const TEST_CLIENT_ID = '11111111-1111-4111-8111-111111111111';

export function createClientQuoteProfile(clientId = TEST_CLIENT_ID): ClientQuoteProfile {
  return {
    clientId,
    fullName: 'Cliente registrado',
    documentType: 'cc',
    nationalId: '1023456789',
    email: 'cliente@solventa.co',
    phone: '+573001234567',
    birthDate: '1990-01-01',
  };
}

export function clientQuoteProfileResponse(clientId = TEST_CLIENT_ID) {
  const profile = createClientQuoteProfile(clientId);
  return {
    clienteId: profile.clientId,
    nombre: profile.fullName,
    tipoDocumento: profile.documentType,
    numeroDocumento: profile.nationalId,
    correo: profile.email,
    telefono: profile.phone,
    fechaNacimiento: profile.birthDate,
  };
}

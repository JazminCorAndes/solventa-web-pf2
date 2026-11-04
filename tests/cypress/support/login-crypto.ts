import { decodeProtectedHeader } from 'jose';

export function expectEncryptedLogin(body: { correo: string; credencialCifrada: string }) {
  expect(Object.keys(body).sort(), 'campos del login').to.deep.eq(['correo', 'credencialCifrada']);
  expectEncryptedCredential(body, 'solventa-login+jwe');
}

export function expectEncryptedRegistration(body: { correo: string; credencialCifrada: string }) {
  expect(body, 'registro sin contraseña en claro').not.to.have.property('contrasena');
  expectEncryptedCredential(body, 'solventa-register+jwe');
}

function expectEncryptedCredential(
  body: { correo: string; credencialCifrada: string },
  type: 'solventa-login+jwe' | 'solventa-register+jwe',
) {
  expect(typeof body.correo, 'correo externo').to.eq('string');
  expect(typeof body.credencialCifrada, 'JWE compacto').to.eq('string');
  expect(body.credencialCifrada.split('.').length, 'segmentos JWE').to.eq(5);
  expect(decodeProtectedHeader(body.credencialCifrada)).to.include({
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    typ: type,
  });
}

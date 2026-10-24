import { decodeProtectedHeader } from 'jose';

export function expectEncryptedLogin(body: { correo: string; credencialCifrada: string }) {
  expect(Object.keys(body).sort(), 'campos del login').to.deep.eq(['correo', 'credencialCifrada']);
  expect(typeof body.correo, 'correo externo').to.eq('string');
  expect(typeof body.credencialCifrada, 'JWE compacto').to.eq('string');
  expect(body.credencialCifrada.split('.').length, 'segmentos JWE').to.eq(5);
  expect(decodeProtectedHeader(body.credencialCifrada)).to.include({
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    typ: 'solventa-login+jwe',
  });
}

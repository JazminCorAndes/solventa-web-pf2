import { compactDecrypt, exportJWK, generateKeyPair, type JWK } from 'jose';
import { expectEncryptedRegistration } from '../support/login-crypto';
import { fillRegistration } from '../support/registration';

const account = {
  nombre: 'Cliente Sintetico Cypress',
  correo: 'registro-ui@example.invalid',
  contrasena: 'Solo-Pruebas-Cifradas-2026!',
  numeroDocumento: '1023456789',
  telefono: '+573001234567',
  fechaNacimiento: '1990-01-01',
};

describe('UI de registro cifrado (HTTP controlado)', () => {
  let privateKey: CryptoKey;
  let publicKey: JWK;
  let challengeId: string;

  beforeEach(() => {
    cy.then(async () => {
      const pair = await generateKeyPair('RSA-OAEP-256');
      privateKey = pair.privateKey;
      publicKey = await exportJWK(pair.publicKey);
    });
    cy.intercept('/api/**', { statusCode: 501, body: {}, log: false });
    cy.intercept('GET', '/api/v1/usuarios/desafio', (req) => {
      challengeId = crypto.randomUUID();
      req.reply({
        body: {
          desafioId: challengeId,
          clavePublica: {
            ...publicKey,
            alg: 'RSA-OAEP-256',
            use: 'enc',
            kid: 'registration-ui-key',
          },
          expiraEn: new Date(Date.now() + 60000).toISOString(),
        },
        headers: { 'Cache-Control': 'no-store' },
        log: false,
      });
    }).as('registrationChallenge');
    cy.intercept('POST', '/api/v1/usuarios', async (req) => {
      expectEncryptedRegistration(req.body);
      expect(JSON.stringify(req.body).includes(account.contrasena), 'sin contraseña en HTTP').to.eq(
        false,
      );
      const { plaintext, protectedHeader } = await compactDecrypt(
        req.body.credencialCifrada,
        privateKey,
      );
      const payload = JSON.parse(new TextDecoder().decode(plaintext));
      expect(protectedHeader.kid).to.eq('registration-ui-key');
      expect(Object.keys(payload).sort()).to.deep.eq(['contrasena', 'correo', 'desafioId']);
      expect(payload.desafioId, 'desafío de registro emitido').to.eq(challengeId);
      expect(payload.correo === account.correo, 'correo vinculado').to.eq(true);
      expect(
        payload.contrasena === account.contrasena,
        'contraseña descifrada por destinatario',
      ).to.eq(true);
      expect(req.headers).not.to.have.property('authorization');
      req.reply({
        statusCode: 201,
        body: {
          usuario: {
            id: 'registration-ui',
            nombre: account.nombre,
            correo: account.correo,
            rol: 'cliente',
          },
        },
        log: false,
      });
    }).as('registration');
  });

  it('cifra la contraseña y no inicia sesión ni la persiste después de crear la cuenta', () => {
    cy.visit('/registrarse');
    fillRegistration(account, true);
    cy.get('button[type=submit]').click();
    cy.wait('@registration', { log: false });
    cy.contains('[role=status]', 'Tu cuenta fue creada').should('be.visible');
    cy.get('@registrationChallenge.all').should('have.length', 1);
    cy.window({ log: false }).then((win) => {
      expect(JSON.stringify(win.sessionStorage).includes(account.contrasena)).to.eq(false);
      expect(JSON.stringify(win.localStorage).includes(account.contrasena)).to.eq(false);
      expect(win.sessionStorage.getItem('solventa.auth.refresh')).to.eq(null);
    });
    cy.contains('a', 'Iniciar sesión').should('be.visible');
  });

  for (const failure of ['malformed', 'expired', 'unavailable'] as const) {
    it(`detiene el registro ante desafío ${failure} y obtiene otro al reintentar`, () => {
      cy.intercept(
        { method: 'GET', url: '/api/v1/usuarios/desafio', times: 1 },
        {
          statusCode: failure === 'unavailable' ? 503 : 200,
          body:
            failure === 'expired'
              ? { desafioId: 'expired', expiraEn: new Date(0).toISOString(), clavePublica: {} }
              : { clavePublica: { kty: 'oct', k: 'invalid' } },
          log: false,
        },
      ).as('failedChallenge');
      cy.visit('/registrarse');
      fillRegistration(account, false);
      cy.get('button[type=submit]').click();
      cy.wait('@failedChallenge', { log: false });
      cy.get('[role=alert]').should('contain.text', 'No se pudo confirmar el registro');
      cy.get('@registration.all').should('have.length', 0);
      cy.get('button[type=submit]').click();
      cy.wait('@registration', { log: false });
      cy.contains('[role=status]', 'Tu cuenta fue creada').should('be.visible');
    });
  }

  it('explica la falta de Web Crypto sin desafío, POST ni degradación a texto claro', () => {
    cy.visit('/registrarse', {
      onBeforeLoad(win) {
        Object.defineProperty(win.crypto, 'subtle', { value: undefined });
      },
    });
    fillRegistration(account, true);
    cy.get('button[type=submit]').click();
    cy.get('[role=alert]').should('contain.text', 'HTTPS').and('contain.text', 'Web Crypto');
    cy.get('@registrationChallenge.all').should('have.length', 0);
    cy.get('@registration.all').should('have.length', 0);
    cy.get('button[type=submit]').should('be.enabled');
  });

  it('renueva el desafío tras rechazo del servidor sin reutilizar el JWE', () => {
    let firstCiphertext: string;
    cy.intercept({ method: 'POST', url: '/api/v1/usuarios', times: 1 }, (req) => {
      expectEncryptedRegistration(req.body);
      firstCiphertext = req.body.credencialCifrada;
      req.reply({ statusCode: 401, body: {}, log: false });
    }).as('rejectedRegistration');
    cy.visit('/registrarse');
    fillRegistration(account, true);
    cy.get('button[type=submit]').click();
    cy.wait('@rejectedRegistration', { log: false });
    cy.get('[role=alert]').should('contain.text', 'No se pudo confirmar el registro');
    cy.get('button[type=submit]').click();
    cy.wait('@registration', { log: false }).then(({ request }) => {
      expect(request.body.credencialCifrada === firstCiphertext, 'JWE nuevo').to.eq(false);
    });
    cy.get('@registrationChallenge.all').should('have.length', 2);
    cy.contains('[role=status]', 'Tu cuenta fue creada').should('be.visible');
  });
});

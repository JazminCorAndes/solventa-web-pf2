import { login, openQuote, products } from '../support/products';
import { Grant, observeLogin, register, request } from '../support/real-backend';
import { expectEncryptedLogin } from '../support/login-crypto';

describe('E2E integrado: errores de identidad y autorizacion reales', () => {
  it('rechaza credenciales invalidas, duplicados, consultas anonimas y refresh revocado', () => {
    request({
      url: '/api/v1/clientes/me/dashboard',
    }).then(({ status }) => expect(status).to.eq(401));
    register().then((account) => {
      request({
        method: 'POST',
        url: '/api/v1/usuarios',
        body: {
          nombre: 'Cliente Sintetico Cypress',
          correo: account.email,
          contrasena: account.password,
        },
      }).then(({ status }) => expect(status, 'correo duplicado').to.eq(409));
      cy.intercept('POST', '/api/v1/sesiones', (request) => {
        expectEncryptedLogin(request.body);
        expect(
          JSON.stringify(request.body).includes('Contrasena-Incorrecta-2026!'),
          'sin contraseña en el login rechazado',
        ).to.eq(false);
      }).as('badLogin');
      cy.visit('/iniciar-sesion');
      cy.get('#login-email').type(account.email, { log: false });
      cy.get('#login-password').type('Contrasena-Incorrecta-2026!', { log: false });
      cy.get('button[type=submit]').click();
      cy.wait('@badLogin', { log: false }).then(({ response }) =>
        expect(response?.statusCode).to.eq(401),
      );
      cy.contains('[role=alert]', 'El usuario o la contraseña son incorrectos').should(
        'be.visible',
      );
      observeLogin();
      login(account.email, account.password);
      cy.wait<unknown, Grant>('@realLogin', { log: false }).then(({ response }) => {
        const { accessToken, refreshToken } = response!.body;
        request({
          method: 'POST',
          url: '/api/v1/solicitudes-cotizacion',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: { productoId: products[0].id, datosProducto: products[0].data },
        }).then(({ status, body }) => {
          expect(status).to.eq(403);
          expect(body.code).to.eq('consentimiento_ausente');
        });
        openQuote(products[0]);
        cy.contains('button', 'Cerrar sesión').click();
        cy.location('pathname').should('eq', '/iniciar-sesion');
        request({
          method: 'POST',
          url: '/api/v1/sesiones/renovar',
          body: { refreshToken },
        }).then(({ status }) =>
          expect(status, 'refresh no reutilizable luego de logout').to.eq(401),
        );
      });
    });
  });
});

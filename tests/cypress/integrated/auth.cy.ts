import { login, openQuote, products } from '../support/products';
import { Grant, observeLogin, register, request } from '../support/real-backend';
import { expectEncryptedLogin, expectEncryptedRegistration } from '../support/login-crypto';
import { fillRegistration } from '../support/registration';

describe('E2E integrado: errores de identidad y autorizacion reales', () => {
  it('rechaza credenciales invalidas, duplicados, consultas anonimas y refresh revocado', () => {
    request({
      url: '/api/v1/clientes/me/dashboard',
    }).then(({ status }) => expect(status).to.eq(401));
    register().then((account) => {
      cy.intercept('POST', '/api/v1/usuarios', (req) => {
        expectEncryptedRegistration(req.body);
        expect(JSON.stringify(req.body).includes(account.password), 'sin contraseña en HTTP').to.eq(
          false,
        );
      }).as('duplicateRegistration');
      cy.visit('/registrarse');
      fillRegistration(
        {
          nombre: 'Cliente Sintetico Cypress',
          correo: account.email,
          contrasena: account.password,
          numeroDocumento: account.document,
          telefono: '+573001234567',
          fechaNacimiento: '1990-01-01',
        },
        false,
      );
      cy.get('button[type=submit]').click();
      cy.wait('@duplicateRegistration', { log: false }).then(({ response }) => {
        expect(response?.statusCode, 'correo duplicado con credencial cifrada').to.eq(409);
      });
      cy.contains('[role=alert]', 'Ya existe una cuenta').should('be.visible');
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

interface RegistrationFields {
  nombre: string;
  correo: string;
  contrasena: string;
  numeroDocumento: string;
  telefono: string;
  fechaNacimiento: string;
}

export function fillRegistration(account: RegistrationFields, authorized: boolean) {
  for (const [id, value] of Object.entries({
    'register-name': account.nombre,
    'register-email': account.correo,
    'register-document': account.numeroDocumento,
    'register-phone': account.telefono,
    'register-birth-date': account.fechaNacimiento,
    'register-password': account.contrasena,
    'register-confirm-password': account.contrasena,
  })) {
    cy.get(`#${id}`).closest('mat-form-field').find('mat-label').click();
    cy.get(`#${id}`).should('be.focused').type(value, { log: false });
  }
  cy.contains('mat-radio-button', authorized ? 'Autorizo el uso' : 'No autorizo por ahora')
    .find('label')
    .click();
  cy.get('input[type=radio]:checked').should('have.value', String(authorized));
  cy.get('form').should('have.class', 'ng-valid');
}

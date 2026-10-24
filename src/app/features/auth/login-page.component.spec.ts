import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
import {
  AccessDeniedError,
  InvalidCredentialsError,
  LoginEncryptionUnavailableError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AuthGrant } from '../../core/auth/auth.models';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { grantFor, TestAuthGateway, TestAuthStorage } from '../../core/auth/auth.testing';
import { LoginPageComponent } from './login-page.component';

@Component({ template: '' })
class EmptyPageComponent {}

describe('LoginPageComponent', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let gateway: TestAuthGateway;
  let loginCalls: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        LoginPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              auth: {
                title: 'Iniciar sesión',
                email: { label: 'Correo', placeholder: 'correo' },
                password: {
                  label: 'Contraseña',
                  placeholder: 'contraseña',
                  show: 'Mostrar',
                  hide: 'Ocultar',
                },
                forgotPassword: 'Olvidé mi contraseña',
                submit: 'Iniciar sesión',
                processing: 'Procesando',
                noAccount: 'Sin cuenta',
                contact: 'Contacto',
                validation: {
                  emailRequired: 'Correo requerido',
                  emailInvalid: 'Correo inválido',
                  passwordRequired: 'Contraseña requerida',
                },
                errors: {
                  invalidCredentials: 'Credenciales inválidas',
                  tooManyAttempts: 'Demasiados intentos',
                  unavailable: 'Servicio no disponible',
                  encryptionUnavailable: 'Usa HTTPS y un navegador con Web Crypto',
                  unexpected: 'Error inesperado',
                },
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([{ path: 'app/dashboard', component: EmptyPageComponent }]),
        { provide: AUTH_GATEWAY, useValue: new TestAuthGateway() },
        { provide: AUTH_STORAGE, useValue: new TestAuthStorage() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    gateway = TestBed.inject(AUTH_GATEWAY) as TestAuthGateway;
    loginCalls = 0;
    const loginResult = gateway.loginResult;
    gateway.loginResult = () => {
      loginCalls++;
      return loginResult();
    };
    fixture.detectChanges();
  });

  it('does not submit an invalid form', () => {
    component.submit();

    expect(loginCalls).toBe(0);
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('shows a generic invalid credentials error', () => {
    gateway.loginResult = () => throwError(() => new InvalidCredentialsError());
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'incorrecta',
    });

    component.submit();

    expect(component.errorKey()).toBe('auth.errors.invalidCredentials');
  });

  it('shows access denied without navigating', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    gateway.loginResult = () => throwError(() => new AccessDeniedError());
    component.form.setValue({ email: 'socio@example.com', password: 'secret' });
    component.submit();
    expect(component.errorKey()).toBe('partners.errors.forbidden');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a rate limit error', () => {
    gateway.loginResult = () => throwError(() => new TooManyAttemptsError(300));
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'incorrecta',
    });

    component.submit();

    expect(component.errorKey()).toBe('auth.errors.tooManyAttempts');
  });

  it('shows an actionable crypto error and keeps the form available for retry', () => {
    gateway.loginResult = () => throwError(() => new LoginEncryptionUnavailableError());
    component.form.setValue({ email: 'cliente@solventa.co', password: 'Solventa123!' });

    component.submit();
    fixture.detectChanges();

    expect(component.errorKey()).toBe('auth.errors.encryptionUnavailable');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Usa HTTPS');
    expect(component.loading()).toBe(false);
    expect(component.form.enabled).toBe(true);
  });

  it('prevents duplicate submissions while authentication is pending', () => {
    gateway.loginResult = (): Observable<AuthGrant> => {
      loginCalls++;
      return new Subject<AuthGrant>();
    };
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'Solventa123!',
    });

    component.submit();
    component.submit();

    expect(loginCalls).toBe(1);
    expect(component.loading()).toBe(true);
  });

  it('navigates to the protected dashboard after login', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'Solventa123!',
    });

    component.submit();

    expect(navigate).toHaveBeenCalledWith('/app/dashboard');
  });

  it('navigates to the partner portal using the authenticated role', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const grant = grantFor('partner-access', 'partner-refresh');
    gateway.loginResult = () =>
      of({
        ...grant,
        session: {
          ...grant.session,
          user: { ...grant.session.user, role: 'partner', partnerIds: ['BANK-E2E'] },
        },
      });
    component.form.setValue({ email: 'socio@example.com', password: 'secret' });

    component.submit();

    expect(navigate).toHaveBeenCalledWith('/app/socios');
  });
});

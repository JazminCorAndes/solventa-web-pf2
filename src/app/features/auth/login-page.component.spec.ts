import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
import {
  AccessDeniedError,
  InvalidCredentialsError,
  CredentialEncryptionUnavailableError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AuthGrant } from '../../core/auth/auth.models';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { grantFor, TestAuthGateway, TestAuthStorage } from '../../core/auth/auth.testing';
import { LoginPageComponent } from './login-page.component';
import { ThemeService } from '../../core/theme/theme.service';
import en from '../../../../public/assets/i18n/en.json';

@Component({ template: '' })
class EmptyPageComponent {}

describe('LoginPageComponent', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let gateway: TestAuthGateway;
  let loginCalls: number;

  beforeEach(async () => {
    localStorage.removeItem('solventa-theme');
    await TestBed.configureTestingModule({
      imports: [
        LoginPageComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en,
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
                theme: { useLight: 'Usar tema claro', useDark: 'Usar tema oscuro' },
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
          translocoConfig: {
            availableLangs: ['es', 'en'],
            defaultLang: 'es',
            reRenderOnLangChange: true,
          },
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

  afterEach(() => {
    localStorage.removeItem('solventa-theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
  });

  it('changes the real global theme without submitting, reconstructing or changing the form', () => {
    component.form.setValue({ email: 'synthetic@example.test', password: 'synthetic' });
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#login-password');
    input.focus();
    const form = component.form;
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('app-theme-toggle button');
    button.click();
    fixture.detectChanges();
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('solventa-theme')).toBe('light');
    expect(component.form).toBe(form);
    expect(component.form.getRawValue()).toEqual({
      email: 'synthetic@example.test',
      password: 'synthetic',
    });
    expect(fixture.nativeElement.querySelector('#login-password')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(component.passwordVisible()).toBe(false);
    expect(loginCalls).toBe(0);
  });

  it('does not submit an invalid form', () => {
    component.submit();

    expect(loginCalls).toBe(0);
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('uses the real English control translations without changing their semantics', () => {
    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('app-theme-toggle button').getAttribute('aria-label'),
    ).toBe(en.theme.useLight);
  });

  it('keeps appearance controls independent of an authoritative pending/error login', () => {
    const result = new Subject<AuthGrant>();
    gateway.loginResult = () => {
      loginCalls++;
      return result;
    };
    component.form.setValue({ email: 'synthetic@example.test', password: 'synthetic' });
    component.submit();
    fixture.detectChanges();
    const themeButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('app-theme-toggle button');
    themeButton.click();
    fixture.detectChanges();
    expect(component.loading()).toBe(true);
    expect(component.form.disabled).toBe(true);
    expect(loginCalls).toBe(1);
    result.error(new InvalidCredentialsError());
    fixture.detectChanges();
    expect(component.errorKey()).toBe('auth.errors.invalidCredentials');
    expect(component.form.enabled).toBe(true);
    expect(component.form.getRawValue()).toEqual({
      email: 'synthetic@example.test',
      password: 'synthetic',
    });
    expect(fixture.nativeElement.querySelector('app-theme-toggle button')).toBe(themeButton);
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
    gateway.loginResult = () => throwError(() => new CredentialEncryptionUnavailableError());
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

  it('navega al portal asesor con el rol autenticado', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const grant = grantFor('advisor-access', 'advisor-refresh');
    grant.session.user = { ...grant.session.user, role: 'advisor', partnerIds: ['BANCO-001'] };
    gateway.loginResult = () => of(grant);
    component.form.setValue({ email: 'asesor@example.com', password: 'test-secret' });
    component.submit();
    expect(navigate).toHaveBeenCalledWith('/asesor/perfilamientos/nuevo');
  });
});

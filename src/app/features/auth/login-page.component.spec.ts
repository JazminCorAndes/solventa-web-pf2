import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, Subject, throwError } from 'rxjs';
import { InvalidCredentialsError } from '../../core/auth/auth.errors';
import { AUTH_GATEWAY, AuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession } from '../../core/auth/auth.models';
import { AUTH_STORAGE, AuthStorage } from '../../core/auth/auth-storage.service';
import { LoginPageComponent } from './login-page.component';

@Component({ template: '' })
class EmptyPageComponent {}

class TestAuthStorage implements AuthStorage {
  read(): null {
    return null;
  }
  write(): void {}
  clear(): void {}
}

class TestAuthGateway implements AuthGateway {
  calls = 0;
  response: Observable<AuthSession> = of({
    user: {
      id: 'client-001',
      name: 'Cliente Solventa',
      email: 'cliente@solventa.co',
      role: 'client',
    },
    expiresAt: Date.now() + 60_000,
  });

  login(): Observable<AuthSession> {
    this.calls++;
    return this.response;
  }
}

describe('LoginPageComponent', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let gateway: TestAuthGateway;

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
                  unavailable: 'Servicio no disponible',
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
        { provide: AUTH_GATEWAY, useClass: TestAuthGateway },
        { provide: AUTH_STORAGE, useClass: TestAuthStorage },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    gateway = TestBed.inject(AUTH_GATEWAY) as TestAuthGateway;
    fixture.detectChanges();
  });

  it('does not submit an invalid form', () => {
    component.submit();

    expect(gateway.calls).toBe(0);
    expect(component.form.controls.email.touched).toBe(true);
    expect(component.form.controls.password.touched).toBe(true);
  });

  it('shows a generic invalid credentials error', () => {
    gateway.response = throwError(() => new InvalidCredentialsError());
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'incorrecta',
    });

    component.submit();

    expect(component.errorKey()).toBe('auth.errors.invalidCredentials');
  });

  it('prevents duplicate submissions while authentication is pending', () => {
    gateway.response = new Subject<AuthSession>();
    component.form.setValue({
      email: 'cliente@solventa.co',
      password: 'Solventa123!',
    });

    component.submit();
    component.submit();

    expect(gateway.calls).toBe(1);
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
});

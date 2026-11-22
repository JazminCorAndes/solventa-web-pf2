import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom, Subject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import {
  AuthenticationUnavailableError,
  InvalidRecoveryLinkError,
} from '../../core/auth/auth.errors';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AuthService } from '../../core/auth/auth.service';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { TestAuthGateway, TestAuthStorage } from '../../core/auth/auth.testing';
import { RecoveryLinkService } from '../../core/auth/recovery-link.service';
import { routes } from '../../app.routes';
import { PasswordRecoveryPageComponent } from './password-recovery-page.component';

describe('PasswordRecoveryPageComponent', () => {
  async function setup(reset: boolean, token: string | null = 'a'.repeat(64)) {
    const gateway = new TestAuthGateway();
    const recoveryLink = new RecoveryLinkService();
    if (token) {
      history.replaceState(null, '', `/recuperar-contrasena#token=${token}`);
      recoveryLink.capture(location, history);
    }
    await TestBed.configureTestingModule({
      imports: [
        PasswordRecoveryPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter(routes),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { resetPassword: reset } } } },
        { provide: AUTH_GATEWAY, useValue: gateway },
        { provide: AUTH_STORAGE, useValue: new TestAuthStorage() },
        { provide: RecoveryLinkService, useValue: recoveryLink },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PasswordRecoveryPageComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, gateway };
  }

  afterEach(() => history.replaceState(null, '', '/'));

  it('solicita sólo correo y no muestra envío exitoso cuando falta transporte', async () => {
    const { component, fixture, gateway } = await setup(false);
    const result = new Subject<void>();
    const request = vi.spyOn(gateway, 'requestPasswordRecovery').mockReturnValue(result);
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(1);
    component.form.patchValue({ email: 'sintetico@example.test' });
    component.submit();
    expect(request).toHaveBeenCalledWith('sintetico@example.test');
    expect(component.success()).toBe(false);
    component.submit();
    expect(request).toHaveBeenCalledTimes(1);
    result.error(new AuthenticationUnavailableError());
    expect(component.success()).toBe(false);
    expect(component.errorKey()).toBe('recovery.errors.unavailable');
    expect(component.form.enabled).toBe(true);
  });

  it('pide sólo nueva contraseña, preserva espacios y limpia sesión sólo tras confirmación', async () => {
    const { component, fixture, gateway } = await setup(true);
    const auth = TestBed.inject(AuthService);
    await firstValueFrom(auth.login({ email: 'sintetico@example.test', password: 'sintetica' }));
    const result = new Subject<void>();
    const reset = vi.spyOn(gateway, 'resetPassword').mockReturnValue(result);
    expect(
      routes.find((route) => route.path === 'recuperar-contrasena')?.canActivate,
    ).toBeUndefined();
    expect(fixture.nativeElement.querySelectorAll('input')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('input').autocomplete).toBe('new-password');
    component.form.patchValue({ password: 'corta' });
    component.submit();
    expect(reset).not.toHaveBeenCalled();
    component.form.patchValue({ password: ' nueva clave ' });
    component.submit();
    expect(reset).toHaveBeenCalledWith('a'.repeat(64), ' nueva clave ');
    expect(component.success()).toBe(false);
    expect(auth.user()).not.toBeNull();
    result.next();
    result.complete();
    fixture.detectChanges();
    expect(component.success()).toBe(true);
    expect(auth.user()).toBeNull();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });

  it('impide guardar con enlace ausente o rechazado sin conservar el secreto', async () => {
    const { component, gateway } = await setup(true);
    const result = new Subject<void>();
    const reset = vi.spyOn(gateway, 'resetPassword').mockReturnValue(result);
    component.form.patchValue({ password: 'nueva clave' });
    component.submit();
    result.error(new InvalidRecoveryLinkError());
    component.submit();
    expect(component.invalidLink()).toBe(true);
    expect(component.success()).toBe(false);
    expect(reset).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    const missing = await setup(true, null);
    const missingReset = vi.spyOn(missing.gateway, 'resetPassword');
    missing.component.submit();
    expect(missing.component.invalidLink()).toBe(true);
    expect(missingReset).not.toHaveBeenCalled();
  });
});

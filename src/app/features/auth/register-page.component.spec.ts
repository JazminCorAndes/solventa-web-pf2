import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { of, Subject, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import en from '../../../../public/assets/i18n/en.json';
import {
  AuthenticationUnavailableError,
  CredentialEncryptionUnavailableError,
  EmailAlreadyRegisteredError,
  InvalidRegistrationError,
  TooManyAttemptsError,
} from '../../core/auth/auth.errors';
import { AUTH_GATEWAY } from '../../core/auth/auth.gateway';
import { AuthUser } from '../../core/auth/auth.models';
import { AUTH_STORAGE } from '../../core/auth/auth-storage.service';
import { AuthService } from '../../core/auth/auth.service';
import { TEST_USER, TestAuthGateway, TestAuthStorage } from '../../core/auth/auth.testing';
import { RegisterPageComponent } from './register-page.component';

const VALUES = {
  name: 'Cliente de prueba',
  email: 'registro@example.com',
  documentType: 'cc' as const,
  documentNumber: '1023456789',
  phone: '+573001234567',
  birthDate: '1990-01-15',
  password: 'Password-Test!',
  confirmPassword: 'Password-Test!',
  authorized: true,
};

describe('RegisterPageComponent', () => {
  let fixture: ComponentFixture<RegisterPageComponent>;
  let component: RegisterPageComponent;
  const register = vi.fn<TestAuthGateway['register']>();

  beforeEach(async () => {
    register.mockReset().mockReturnValue(of(TEST_USER));
    const gateway = new TestAuthGateway();
    gateway.register = register;
    await TestBed.configureTestingModule({
      imports: [
        RegisterPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: {
            availableLangs: ['es', 'en'],
            defaultLang: 'es',
            reRenderOnLangChange: true,
          },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AUTH_GATEWAY, useValue: gateway },
        { provide: AUTH_STORAGE, useValue: new TestAuthStorage() },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RegisterPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('requires all master data and an explicit decision, with no consent selected', () => {
    expect(component.form.controls.authorized.value).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type=radio]:checked')).toBeNull();
    component.submit();
    expect(register).not.toHaveBeenCalled();
    expect(Object.values(component.form.controls).every((control) => control.touched)).toBe(true);
    component.form.setValue({ ...VALUES, authorized: null });
    component.submit();
    expect(register).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'submits the decision %s without login or password persistence',
    (authorized) => {
      component.form.setValue({ ...VALUES, name: ' Cliente de prueba ', authorized });
      component.submit();
      fixture.detectChanges();
      expect(register).toHaveBeenCalledWith({
        name: VALUES.name,
        email: VALUES.email,
        password: VALUES.password,
        documentType: VALUES.documentType,
        documentNumber: VALUES.documentNumber,
        phone: VALUES.phone,
        birthDate: VALUES.birthDate,
        consent: { authorized, termsVersion: '1.0' },
      });
      expect(component.completed()).toBe(true);
      expect(component.form.controls.password.value).toBe('');
      expect(TestBed.inject(AuthService).session()).toBeNull();
      expect(TestBed.inject(AUTH_STORAGE).read()).toBeNull();
      expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain(
        'Tu cuenta fue creada',
      );
      expect(fixture.nativeElement.querySelector('a[href="/iniciar-sesion"]')).not.toBeNull();
      component.submit();
      expect(register).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['name', '   '],
    ['name', 'n'.repeat(121)],
    ['email', 'invalid'],
    ['phone', '3001234567'],
    ['phone', '+57300123456'],
    ['documentNumber', 'ABC12345'],
    ['documentNumber', '12345'],
    ['birthDate', '2025-02-29'],
    ['birthDate', 'invalid'],
    ['birthDate', '2999-01-01'],
    ['password', '1234567'],
    ['password', 'p'.repeat(129)],
    ['confirmPassword', 'different'],
  ] as const)('rejects invalid %s: %s', (field, value) => {
    component.form.setValue(VALUES);
    component.form.controls[field].setValue(value);
    component.submit();
    expect(register).not.toHaveBeenCalled();
  });

  it('revalidates document type and normalizes passports without trimming passwords', () => {
    const password = '  Password-Test!  ';
    component.form.setValue({
      ...VALUES,
      documentNumber: 'ab12345',
      password,
      confirmPassword: password,
    });
    expect(component.form.controls.documentNumber.invalid).toBe(true);
    component.form.controls.documentType.setValue('passport');
    expect(component.form.controls.documentNumber.valid).toBe(true);
    component.submit();
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: 'AB12345', password }),
    );
  });

  it('does not impose an adult-only restriction but rejects today', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const dateString = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    component.form.setValue({ ...VALUES, birthDate: dateString(now) });
    component.submit();
    expect(register).not.toHaveBeenCalled();
    component.form.controls.birthDate.setValue(dateString(yesterday));
    component.submit();
    expect(register).toHaveBeenCalledOnce();
  });

  it('prevents duplicate submissions while pending and cancels updates after destruction', () => {
    const result = new Subject<AuthUser>();
    register.mockReturnValue(result);
    component.form.setValue(VALUES);
    component.submit();
    component.submit();
    expect(register).toHaveBeenCalledOnce();
    expect(component.form.disabled).toBe(true);
    fixture.destroy();
    result.next(TEST_USER);
    expect(component.completed()).toBe(false);
  });

  it.each([
    [new EmailAlreadyRegisteredError(), 'registration.errors.duplicate'],
    [new InvalidRegistrationError(), 'registration.errors.invalid'],
    [new AuthenticationUnavailableError(), 'registration.errors.unavailable'],
    [new CredentialEncryptionUnavailableError(), 'registration.errors.encryptionUnavailable'],
    [new TooManyAttemptsError(60), 'auth.errors.tooManyAttempts'],
    [new Error(), 'auth.errors.unexpected'],
  ] as const)('shows server errors without pretending success: %s', (error, key) => {
    register.mockReturnValue(throwError(() => error));
    component.form.setValue(VALUES);
    component.submit();
    fixture.detectChanges();
    expect(component.errorKey()).toBe(key);
    expect(component.completed()).toBe(false);
    expect(component.form.enabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    register.mockReturnValue(of(TEST_USER));
    component.submit();
    expect(component.completed()).toBe(true);
  });

  it('explains purpose, data, terms, duration and revocation in both languages', async () => {
    for (const [language, labels] of Object.entries({ es, en })) {
      TestBed.inject(TranslocoService).setActiveLang(language);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain(labels.registration.consent.scope);
      expect(fixture.nativeElement.textContent).toContain(labels.registration.consent.duration);
      expect(fixture.nativeElement.textContent).toContain('1.0');
    }
  });
});

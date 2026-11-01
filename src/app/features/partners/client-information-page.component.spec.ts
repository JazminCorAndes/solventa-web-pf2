import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, startWith, Subject, throwError } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { PartnerContext, PartnerContextService } from '../../core/partners/partner-context.service';
import {
  ClientInformationRequest,
  ClientInformationResult,
  HttpClientInformationGateway,
} from '../../data-access/partners/http-client-information.gateway';
import { ClientInformationPageComponent } from './client-information-page.component';

const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTEXT: PartnerContext = {
  apiVersion: '1',
  usuario: {
    id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Socio prueba',
    correo: 'socio@example.com',
    rol: 'socio',
    socios: ['BANCO-001'],
  },
  socios: [{ socioId: 'BANCO-001', productos: ['mortgage-life'] }],
  alcances: ['clientes:consultar'],
};

function resultFor(request: ClientInformationRequest): ClientInformationResult {
  return {
    operationId: request.operationId,
    socioId: request.socioId,
    clienteId: CLIENT_ID,
    productoId: request.productoId,
    finalidad: 'cotizacion',
    estado: 'completada',
    consentimientoId: '44444444-4444-4444-8444-444444444444',
    consentimientoVersion: 2,
    datos: { indicadorRiesgo: '0.50' },
    evidenciaFuentes: [
      {
        fuente: 'open_finance',
        version: 'mock-1',
        consultadaEn: '2026-10-24T20:00:00Z',
        simulada: true,
      },
    ],
    consultadaEn: '2026-10-24T20:00:00Z',
  };
}

describe('ClientInformationPageComponent', () => {
  let fixture: ComponentFixture<ClientInformationPageComponent>;
  let gateway: { consult: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn> };
  let query: Record<string, string>;
  let queryChanges: Subject<ReturnType<typeof convertToParamMap>>;
  let context: WritableSignal<PartnerContext | null>;

  beforeEach(async () => {
    query = { socio: 'BANCO-001' };
    queryChanges = new Subject();
    context = signal<PartnerContext | null>(CONTEXT);
    gateway = { consult: vi.fn(), load: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [
        ClientInformationPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            get queryParamMap() {
              return queryChanges.pipe(startWith(convertToParamMap(query)));
            },
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(query);
              },
            },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        {
          provide: PartnerContextService,
          useValue: { context: context.asReadonly() },
        },
        { provide: HttpClientInformationGateway, useValue: gateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ClientInformationPageComponent);
    fixture.detectChanges();
  });

  it('uses hidden partner context and renders only authorized result data', async () => {
    gateway.consult.mockImplementation((request: ClientInformationRequest) =>
      of(resultFor(request)),
    );
    fixture.componentInstance.form.controls.documentNumber.setValue('1012345678');

    fixture.componentInstance.submit();
    await Promise.resolve();
    fixture.detectChanges();

    const request = gateway.consult.mock.calls[0][0] as ClientInformationRequest;
    expect(request).toMatchObject({
      socioId: 'BANCO-001',
      tipoDocumento: 'cc',
      numeroDocumento: '1012345678',
      productoId: 'mortgage-life',
      finalidad: 'cotizacion',
      datosSolicitados: ['indicador_riesgo'],
    });
    expect(fixture.nativeElement.textContent).toContain('Indicador de riesgo: 0.50');
    expect(fixture.nativeElement.textContent).toContain('Consentimiento vigente · versión 2');
    expect(fixture.nativeElement.querySelectorAll('mat-select')).toHaveLength(2);
  });

  it('keeps the operation identifier when a fail-closed request is retried', async () => {
    let attempt = 0;
    gateway.consult.mockImplementation((request: ClientInformationRequest) => {
      attempt++;
      return attempt === 1
        ? throwError(() => new Error('source unavailable'))
        : of(resultFor(request));
    });
    fixture.componentInstance.form.controls.documentNumber.setValue('1012345678');

    fixture.componentInstance.submit();
    await Promise.resolve();
    const firstRequest = gateway.consult.mock.calls[0][0] as ClientInformationRequest;
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.errorKey()).toBe('clientInformation.errors.unavailable');

    fixture.componentInstance.submit();
    await Promise.resolve();
    const secondRequest = gateway.consult.mock.calls[1][0] as ClientInformationRequest;
    expect(secondRequest.operationId).toBe(firstRequest.operationId);
    expect(fixture.componentInstance.result()?.estado).toBe('completada');
  });

  it('keeps UUID lookup available for legacy clients', async () => {
    gateway.consult.mockImplementation((request: ClientInformationRequest) =>
      of(resultFor(request)),
    );
    fixture.componentInstance.form.controls.searchMode.setValue('id');
    fixture.componentInstance.form.controls.clienteId.setValue(CLIENT_ID);

    fixture.componentInstance.submit();
    await Promise.resolve();

    expect(gateway.consult.mock.calls[0][0]).toMatchObject({ clienteId: CLIENT_ID });
  });

  it('recovers a persisted consultation from the operation in the URL', () => {
    const operationId = '55555555-5555-4555-8555-555555555555';
    query = { socio: 'BANCO-001', operacion: operationId };
    gateway.load.mockReturnValue(
      of(
        resultFor({
          operationId,
          socioId: 'BANCO-001',
          clienteId: CLIENT_ID,
          productoId: 'mortgage-life',
          finalidad: 'cotizacion',
          datosSolicitados: ['indicador_riesgo'],
        }),
      ),
    );

    fixture.destroy();
    fixture = TestBed.createComponent(ClientInformationPageComponent);
    fixture.detectChanges();

    expect(gateway.load).toHaveBeenCalledWith(operationId, 'BANCO-001');
    expect(fixture.componentInstance.result()?.operationId).toBe(operationId);
    expect(gateway.consult).not.toHaveBeenCalled();
  });

  it.each([
    ['user', 'success'],
    ['user', 'error'],
    ['partner', 'success'],
    ['partner', 'error'],
  ] as const)(
    'WEB-F6 ignores a late %s-context %s without retaining previous customer data',
    async (contextChange, outcome) => {
      const response = new Subject<ClientInformationResult>();
      gateway.consult.mockReturnValue(response.asObservable());
      fixture.componentInstance.form.controls.documentNumber.setValue('1012345678');
      fixture.componentInstance.submit();
      await Promise.resolve();
      const request = gateway.consult.mock.calls[0][0] as ClientInformationRequest;

      context.set(
        contextChange === 'user'
          ? {
              ...CONTEXT,
              usuario: { ...CONTEXT.usuario, id: '66666666-6666-4666-8666-666666666666' },
            }
          : {
              ...CONTEXT,
              usuario: { ...CONTEXT.usuario, socios: ['BANCO-002'] },
              socios: [{ socioId: 'BANCO-002', productos: ['mortgage-life'] }],
            },
      );
      fixture.detectChanges();
      await fixture.whenStable();
      if (outcome === 'success') response.next(resultFor(request));
      else response.error(new Error('Previous consultation unavailable'));
      response.complete();
      fixture.detectChanges();

      expect(fixture.componentInstance.result()).toBeNull();
      expect(fixture.componentInstance.errorKey()).not.toBe('clientInformation.errors.unavailable');
      expect(fixture.componentInstance.form.controls.documentNumber.value).toBe('');
      expect(fixture.nativeElement.textContent).not.toContain('Indicador de riesgo: 0.50');
    },
  );

  it('WEB-F6 reloads the operation in the URL and discards an older read', async () => {
    const firstId = '55555555-5555-4555-8555-555555555555';
    const secondId = '66666666-6666-4666-8666-666666666666';
    const firstRead = new Subject<ClientInformationResult>();
    const secondRead = new Subject<ClientInformationResult>();
    const firstRequest: ClientInformationRequest = {
      operationId: firstId,
      socioId: 'BANCO-001',
      clienteId: CLIENT_ID,
      productoId: 'mortgage-life',
      finalidad: 'cotizacion',
      datosSolicitados: ['indicador_riesgo'],
    };
    gateway.load.mockImplementation((operationId: string) =>
      operationId === firstId ? firstRead.asObservable() : secondRead.asObservable(),
    );
    query = { socio: 'BANCO-001', operacion: firstId };
    fixture.destroy();
    fixture = TestBed.createComponent(ClientInformationPageComponent);
    fixture.detectChanges();

    query = { socio: 'BANCO-001', operacion: secondId };
    queryChanges.next(convertToParamMap(query));
    fixture.detectChanges();
    await fixture.whenStable();
    secondRead.next(resultFor({ ...firstRequest, operationId: secondId }));
    secondRead.complete();
    firstRead.next(resultFor(firstRequest));
    firstRead.complete();
    fixture.detectChanges();

    expect(gateway.load).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.operationId()).toBe(secondId);
    expect(fixture.componentInstance.result()?.operationId).toBe(secondId);
    expect(gateway.consult).not.toHaveBeenCalled();
  });

  it('WEB-F6 does not dispatch a consultation after its navigation outlives the user', async () => {
    let finishNavigation!: (navigated: boolean) => void;
    vi.mocked(TestBed.inject(Router).navigate).mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishNavigation = resolve;
      }),
    );
    gateway.consult.mockImplementation((request: ClientInformationRequest) =>
      of(resultFor(request)),
    );
    fixture.componentInstance.form.controls.documentNumber.setValue('1012345678');
    fixture.componentInstance.submit();
    expect(gateway.consult).not.toHaveBeenCalled();

    context.set({
      ...CONTEXT,
      usuario: { ...CONTEXT.usuario, id: '66666666-6666-4666-8666-666666666666' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    finishNavigation(true);
    await Promise.resolve();
    fixture.detectChanges();

    expect(gateway.consult).not.toHaveBeenCalled();
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('WEB-F6 keeps its own URL update attached to one consultation without an early read', async () => {
    let finishNavigation!: (navigated: boolean) => void;
    const navigation = new Promise<boolean>((resolve) => {
      finishNavigation = resolve;
    });
    vi.mocked(TestBed.inject(Router).navigate).mockImplementation((_commands, extras) => {
      query = {
        socio: String(extras?.queryParams?.['socio']),
        operacion: String(extras?.queryParams?.['operacion']),
      };
      queryChanges.next(convertToParamMap(query));
      return navigation;
    });
    const response = new Subject<ClientInformationResult>();
    gateway.consult.mockReturnValue(response.asObservable());
    fixture.componentInstance.form.controls.documentNumber.setValue('1012345678');
    fixture.componentInstance.submit();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(gateway.load).not.toHaveBeenCalled();
    expect(gateway.consult).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(true);

    finishNavigation(true);
    await Promise.resolve();
    const request = gateway.consult.mock.calls[0][0] as ClientInformationRequest;
    response.next(resultFor(request));
    response.complete();
    fixture.detectChanges();

    expect(gateway.consult).toHaveBeenCalledTimes(1);
    expect(gateway.load).not.toHaveBeenCalled();
    expect(fixture.componentInstance.result()?.operationId).toBe(query['operacion']);
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});

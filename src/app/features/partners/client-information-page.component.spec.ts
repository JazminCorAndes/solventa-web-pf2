import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
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
    clienteId: request.clienteId,
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
  let gateway: { consult: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    gateway = { consult: vi.fn() };
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
            snapshot: { queryParamMap: convertToParamMap({ socio: 'BANCO-001' }) },
          },
        },
        {
          provide: PartnerContextService,
          useValue: { context: signal(CONTEXT).asReadonly() },
        },
        { provide: HttpClientInformationGateway, useValue: gateway },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ClientInformationPageComponent);
    fixture.detectChanges();
  });

  it('uses hidden partner context and renders only authorized result data', () => {
    gateway.consult.mockImplementation((request: ClientInformationRequest) =>
      of(resultFor(request)),
    );
    fixture.componentInstance.form.controls.clienteId.setValue(CLIENT_ID);

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const request = gateway.consult.mock.calls[0][0] as ClientInformationRequest;
    expect(request).toMatchObject({
      socioId: 'BANCO-001',
      clienteId: CLIENT_ID,
      productoId: 'mortgage-life',
      finalidad: 'cotizacion',
      datosSolicitados: ['indicador_riesgo'],
    });
    expect(fixture.nativeElement.textContent).toContain('Indicador de riesgo: 0.50');
    expect(fixture.nativeElement.textContent).toContain('Consentimiento vigente · versión 2');
    expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
  });

  it('keeps the operation identifier when a fail-closed request is retried', () => {
    let attempt = 0;
    gateway.consult.mockImplementation((request: ClientInformationRequest) => {
      attempt++;
      return attempt === 1
        ? throwError(() => new Error('source unavailable'))
        : of(resultFor(request));
    });
    fixture.componentInstance.form.controls.clienteId.setValue(CLIENT_ID);

    fixture.componentInstance.submit();
    const firstRequest = gateway.consult.mock.calls[0][0] as ClientInformationRequest;
    expect(fixture.componentInstance.result()).toBeNull();
    expect(fixture.componentInstance.errorKey()).toBe(
      'clientInformation.errors.unavailable',
    );

    fixture.componentInstance.submit();
    const secondRequest = gateway.consult.mock.calls[1][0] as ClientInformationRequest;
    expect(secondRequest.operationId).toBe(firstRequest.operationId);
    expect(fixture.componentInstance.result()?.estado).toBe('completada');
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { BehaviorSubject } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { PartnerContext, PartnerContextService } from '../../core/partners/partner-context.service';
import { historyDto } from '../../../testing/quotes/quote-history.testing';
import { PartnerRequestsPageComponent } from './partner-requests-page.component';

const CONTEXT: PartnerContext = {
  apiVersion: '1',
  usuario: {
    id: 'partner-user',
    nombre: 'Socio',
    correo: 'socio@example.test',
    rol: 'socio',
    socios: ['BANK-A', 'BANK-B'],
  },
  socios: [
    { socioId: 'BANK-A', productos: ['mortgage-life'] },
    { socioId: 'BANK-B', productos: ['mortgage-life'] },
  ],
  alcances: ['perfilamientos:crear'],
};
describe('PartnerRequestsPageComponent', () => {
  let fixture: ComponentFixture<PartnerRequestsPageComponent>;
  let http: HttpTestingController;
  const context = signal<PartnerContext | null>(CONTEXT);
  const params = new BehaviorSubject(convertToParamMap({ socio: 'BANK-A' }));
  const base = `${environment.apiBaseUrl}/v1/socios/solicitudes-cotizacion`;
  beforeEach(async () => {
    context.set(CONTEXT);
    params.next(convertToParamMap({ socio: 'BANK-A' }));
    await TestBed.configureTestingModule({
      imports: [
        PartnerRequestsPageComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PartnerContextService, useValue: { context } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PartnerRequestsPageComponent);
    fixture.detectChanges();
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  const request = (partner = 'BANK-A') => http.expectOne(`${base}?socioId=${partner}`);

  it('renders each request separately for the same client and links only pending authorized operations', () => {
    request().flush({
      solicitudes: [
        historyDto(),
        historyDto({
          solicitudId: 'AQT-2026-654321',
          cotizacionId: '44444444-4444-4444-8444-444444444444',
          estado: 'vencida',
          estadoSeleccion: {
            solicitudId: 'AQT-2026-654321',
            seleccion: null,
            aceptacion: null,
            estadoOferta: null,
          },
        }),
      ],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.textContent).toContain('Pendiente');
    expect(root.textContent).toContain('Vencida');
    expect(root.querySelector('tbody a')?.getAttribute('href')).toContain(
      '/app/socios/cotizaciones/solicitar?socio=BANK-A&operacion=11111111-1111-4111-8111-111111111111',
    );
    expect(root.querySelector('tr[data-request-id="AQT-2026-654321"] a')).toBeNull();
  });

  it('keeps redacted expired associations without personal data or reactivation actions', () => {
    request().flush({
      solicitudes: [
        historyDto({
          estado: 'vencida',
          seleccionRestringida: true,
          estadoSeleccion: null,
          cliente: {
            ...historyDto().cliente,
            nombre: null,
            tipoDocumento: null,
            numeroDocumentoEnmascarado: null,
            consentimientoEstado: 'revocado',
          },
        }),
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Cliente autorizado');
    expect(fixture.nativeElement.textContent).not.toContain('******5678');
    expect(fixture.nativeElement.querySelector('tbody a, tbody button')).toBeNull();
  });

  it('recovers all rows on reload and distinguishes failures from an empty history', () => {
    request().flush({ solicitudes: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(es.partnerRequests.empty);
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    request().flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(es.partnerRequests.empty);
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    request().flush({ solicitudes: [historyDto()] });
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleRequests()).toHaveLength(1);
  });

  it('cancels old organization requests and requires explicit choice across organizations', () => {
    const old = request();
    params.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    http.expectNone((pending) => pending.url === base);
    expect(fixture.nativeElement.textContent).toContain(es.partnerClients.choosePartner);
    params.next(convertToParamMap({ socio: 'BANK-B' }));
    fixture.detectChanges();
    request('BANK-B').flush({ solicitudes: [historyDto({ socioId: 'BANK-B' })] });
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleRequests()[0].partnerId).toBe('BANK-B');
  });

  it('immediately removes data and prevents reads after scope/session loss', () => {
    request().flush({ solicitudes: [historyDto()] });
    fixture.detectChanges();
    context.set({ ...CONTEXT, alcances: [] });
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleRequests()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Cliente autorizado');
    http.expectNone((pending) => pending.url === base);
  });
});

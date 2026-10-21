import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import es from '../../../../public/assets/i18n/es.json';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthService } from '../../core/auth/auth.service';
import { createConsent, createProfile } from '../../core/profiling/profiling.fixtures';
import { PROFILING_GATEWAY } from '../../core/profiling/profiling.gateway';
import { HttpProfilingGateway } from '../../data-access/profiling/http-profiling.gateway';
import { ProfilingPanelComponent } from './profiling-panel.component';

describe('Panel de consentimiento con gateway HTTP autenticado', () => {
  let fixture: ComponentFixture<ProfilingPanelComponent>;
  let http: HttpTestingController;
  const url = `${environment.apiBaseUrl}/v1/consentimientos/perfilamiento`;
  const serverTime = Date.parse('2026-10-21T03:00:00Z');
  const headers = { Date: new Date(serverTime).toUTCString() };

  beforeEach(async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(serverTime + 90 * 86400000);
    await TestBed.configureTestingModule({
      imports: [
        ProfilingPanelComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: PROFILING_GATEWAY, useClass: HttpProfilingGateway },
        { provide: AuthService, useValue: { getAccessToken: () => of('consent-test-token') } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilingPanelComponent);
    fixture.detectChanges();
    http
      .expectOne(url)
      .flush({ code: 'consentimiento_ausente' }, { status: 404, statusText: 'Not Found', headers });
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });

  function click(text: string): void {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
    expect(button).toBeDefined();
    button!.click();
  }

  it.each([true, false])('presenta evidencia y envia decision %s desde la UI', (authorized) => {
    const content = fixture.nativeElement.textContent;
    expect(content).toContain(es.profiling.decision.purpose);
    expect(content).toContain(es.profiling.decision.permissions);
    expect(content).toContain(es.profiling.decision.data);
    expect(content).toContain(es.profiling.decision.rights);
    expect(content).toContain('1.0');
    const time: HTMLTimeElement = fixture.nativeElement.querySelector('time');
    expect(Date.parse(time.dateTime)).toBe(serverTime + 30 * 86400000);
    http.expectNone(url);
    click(authorized ? es.profiling.authorize : es.profiling.reject);
    const request = http.expectOne(url);
    expect(request.request.headers.get('Authorization')).toBe('Bearer consent-test-token');
    expect(request.request.body).toEqual({
      autorizado: authorized,
      version: 0,
      solicitud: {
        finalidad: 'cotizacion',
        alcances: ['open_finance', 'open_data'],
        fuentes: ['open_finance', 'open_data'],
        datos: ['indicador_riesgo'],
        versionTerminos: '1.0',
        vigenteHasta: time.dateTime,
      },
    });
    const consent = {
      ...createConsent(),
      ...request.request.body.solicitud,
      efectivaEn: new Date(serverTime).toISOString(),
      estado: authorized ? 'autorizado' : 'rechazado',
    };
    request.flush(consent, { headers });
    fixture.detectChanges();
    expect(fixture.componentInstance.authorized()).toBe(authorized);
    fixture.componentInstance.reload();
    http.expectOne(url).flush(consent, { headers });
    expect(fixture.componentInstance.consent()?.vigenteHasta).toBe(time.dateTime);
    http.expectNone((pending) => pending.method === 'PUT');
  });

  it('consulta el perfil solo tras autorizar y lo retira antes de confirmar revocacion', () => {
    const consent = {
      ...createConsent(),
      efectivaEn: new Date(serverTime).toISOString(),
      vigenteHasta: new Date(serverTime + 30 * 86400000).toISOString(),
    };
    click(es.profiling.authorize);
    http.expectOne(url).flush(consent, { headers });
    fixture.componentRef.setInput('requestId', 'AQT-2026-123456');
    fixture.detectChanges();
    // El primer cambio de input se deja a OnInit; recargar representa abrir el resumen.
    fixture.componentInstance.reload();
    http.expectOne(url).flush(consent, { headers });
    const profile = createProfile();
    profile.calculadoEn = new Date(serverTime).toISOString();
    profile.vigenteHasta = new Date(serverTime + 900000).toISOString();
    profile.fuentes.forEach((source) => {
      source.consultadaEn = profile.calculadoEn;
      source.vigenteHasta = profile.vigenteHasta;
    });
    http
      .expectOne(
        `${environment.apiBaseUrl}/v1/solicitudes-cotizacion/AQT-2026-123456/perfilamiento`,
      )
      .flush(profile, { headers });
    fixture.detectChanges();
    expect(fixture.componentInstance.profile()?.perfilId).toBe(profile.perfilId);
    click(es.profiling.revoke);
    expect(fixture.componentInstance.profile()).toBeNull();
    const revocation = http.expectOne(url);
    expect(revocation.request.body).toEqual({ autorizado: false, version: 1 });
    revocation.flush({ ...consent, estado: 'revocado', version: 2 }, { headers });
    expect(fixture.componentInstance.authorized()).toBe(false);
    http.expectNone((request) => request.url.includes('solicitudes-cotizacion'));
  });
});

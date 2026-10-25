import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../../public/assets/i18n/es.json';
import { PartnerContext, PartnerContextService } from '../../core/partners/partner-context.service';
import { PartnerHomePageComponent } from './partner-home-page.component';
import realContext from './testing/partner-context-real.json';

describe('PartnerHomePageComponent', () => {
  const context = signal<PartnerContext | null>(null);

  beforeEach(() => {
    context.set(null);
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [provideRouter([]), { provide: PartnerContextService, useValue: { context } }],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(PartnerHomePageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const metric = (host: HTMLElement, id: string) =>
    host.querySelector(`[data-testid="metric-${id}"]`)?.textContent?.trim();

  it('renders nothing before the authenticated context is validated', () => {
    expect(render().textContent?.trim()).toBe('');
  });

  it('summarizes only the organizations, products and scopes granted by the contract', () => {
    context.set(realContext as PartnerContext);
    const host = render();
    expect(host.querySelector('h1')?.textContent).toContain('Portal de socios');
    expect(metric(host, 'organizations')).toBe('1');
    expect(metric(host, 'products')).toBe(String(realContext.socios[0].productos.length));
    expect(metric(host, 'operations')).toBe(String(realContext.alcances.length));
    expect(host.querySelectorAll('.product-list li')).toHaveLength(
      realContext.socios[0].productos.length,
    );
  });

  it('counts a product shared by several organizations once', () => {
    context.set({
      ...(realContext as PartnerContext),
      usuario: { ...realContext.usuario, socios: ['A', 'B'] } as PartnerContext['usuario'],
      socios: [
        { socioId: 'A', productos: ['life', 'travel'] },
        { socioId: 'B', productos: ['life'] },
      ],
    });
    const host = render();
    expect(metric(host, 'organizations')).toBe('2');
    expect(metric(host, 'products')).toBe('2');
    expect(host.querySelectorAll('.partner-card')).toHaveLength(2);
  });

  it('links to client lookup only with the clientes:consultar scope', () => {
    const base = realContext as PartnerContext;
    context.set(base);
    let host = render();
    expect(host.querySelector('a[href*="clientes/consultar"]')).not.toBeNull();

    context.set({ ...base, alcances: ['perfilamientos:crear'] });
    host = render();
    expect(host.querySelector('a[href*="clientes/consultar"]')).toBeNull();
    expect(host.querySelector('a[href*="cotizaciones/solicitar"]')).not.toBeNull();
    expect(metric(host, 'operations')).toBe('1');
  });

  it('offers a quote only for an organization with products and the create scope', () => {
    context.set({
      ...(realContext as PartnerContext),
      socios: [{ socioId: 'BANK-E2E', productos: [] }],
    });
    let host = render();
    expect(host.querySelector('a[href*="cotizaciones/solicitar"]')).toBeNull();
    expect(host.textContent).toContain('No hay productos habilitados');

    context.set({ ...(realContext as PartnerContext), alcances: [] });
    host = render();
    expect(host.querySelector('a[href*="cotizaciones/solicitar"]')).toBeNull();
    expect(metric(host, 'operations')).toBe('0');
  });
});

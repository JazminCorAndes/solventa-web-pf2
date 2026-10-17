import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpInsuranceCatalogGateway } from './http-insurance-catalog.gateway';

describe('HttpInsuranceCatalogGateway', () => {
  let gateway: HttpInsuranceCatalogGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpInsuranceCatalogGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpInsuranceCatalogGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the available product summaries', async () => {
    const result = firstValueFrom(gateway.loadProducts());
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`);
    request.flush({
      productos: [
        {
          id: 'travel',
          nombre: 'Seguro de Viaje',
          descripcion: 'Protección durante el viaje',
          disponible: true,
          coberturasPrincipales: ['Asistencia médica'],
        },
      ],
    });

    await expect(result).resolves.toEqual([
      {
        id: 'travel',
        name: 'Seguro de Viaje',
        description: 'Protección durante el viaje',
        available: true,
        mainCoverages: ['Asistencia médica'],
      },
    ]);
  });

  it('maps one product detail without mixing its coverage', async () => {
    const result = firstValueFrom(gateway.loadProduct('travel'));
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/travel`);
    request.flush({
      id: 'travel',
      nombre: 'Seguro de Viaje',
      descripcion: 'Protección durante el viaje',
      disponible: true,
      coberturasPrincipales: ['Asistencia médica'],
      coberturas: [
        {
          nombre: 'Asistencia médica',
          descripcion: 'Atención por enfermedad o accidente.',
        },
      ],
      condiciones: ['Válido durante las fechas declaradas.'],
      informacionRelevante: {
        sumaAsegurada: '200000000',
        deducible: '200000',
        moneda: 'COP',
        vigencia: 'Por la duración del viaje',
      },
    });

    await expect(result).resolves.toMatchObject({
      id: 'travel',
      coverages: [{ name: 'Asistencia médica' }],
      relevantInformation: {
        insuredAmount: 200000000,
        deductible: 200000,
      },
    });
  });

  it('returns null when the product does not exist', async () => {
    const result = firstValueFrom(gateway.loadProduct('unknown'));
    const request = http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/unknown`);
    request.flush({ code: 'seguro_no_encontrado' }, { status: 404, statusText: 'Not Found' });

    await expect(result).resolves.toBeNull();
  });

  it.each(['<html>Not Found</html>', {}, { code: 'otra_causa' }])(
    'does not hide infrastructure 404 errors: %j',
    async (body) => {
      const result = firstValueFrom(gateway.loadProduct('travel'));
      http
        .expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/travel`)
        .flush(body, { status: 404, statusText: 'Not Found' });
      await expect(result).rejects.toMatchObject({ status: 404 });
    },
  );

  it('rejects a summary without main coverages instead of fabricating them', async () => {
    const result = firstValueFrom(gateway.loadProducts());
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro`).flush({
      productos: [{ id: 'travel', nombre: 'Viaje', descripcion: 'Viaje', disponible: false }],
    });
    await expect(result).rejects.toThrow(/invalid product/);
  });

  it.each(['', ' ', '-1', 'NaN', '1e3'])('rejects invalid catalog amount %j', async (amount) => {
    const result = firstValueFrom(gateway.loadProduct('travel'));
    http.expectOne(`${environment.apiBaseUrl}/v1/productos-seguro/travel`).flush({
      id: 'travel',
      nombre: 'Viaje',
      descripcion: 'Viaje',
      disponible: false,
      coberturasPrincipales: [],
      coberturas: [],
      condiciones: [],
      informacionRelevante: {
        sumaAsegurada: amount,
        deducible: '0',
        moneda: 'COP',
        vigencia: 'Por viaje',
      },
    });
    await expect(result).rejects.toThrow(/monetary/);
  });
});

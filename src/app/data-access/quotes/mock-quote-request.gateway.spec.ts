import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { MockQuoteRequestGateway } from './mock-quote-request.gateway';

describe('MockQuoteRequestGateway', () => {
  it('incluye los ocho ramos del catálogo y conserva los datos de cada solicitud', async () => {
    TestBed.configureTestingModule({
      providers: [
        MockQuoteRequestGateway,
        {
          provide: AuthService,
          useValue: {
            user: () => ({
              documentType: 'cc',
              nationalId: '1023456789',
              email: 'cliente@solventa.co',
              phone: '+573001234567',
            }),
          },
        },
      ],
    });
    const gateway = TestBed.inject(MockQuoteRequestGateway);
    const products = await firstValueFrom(gateway.loadProducts());
    expect(products.map((product) => product.id)).toEqual([
      'automotive',
      'travel',
      'life',
      'device-protection',
      'parametric',
      'parametric-weather',
      'payment-protection',
      'mortgage-life',
    ]);
    expect(products.every((product) => product.available)).toBe(true);
    const productData = {
      location: 'Villavicencio, Meta',
      weatherEvent: 'drought',
      startDate: '2028-01-01',
      endDate: '2028-02-01',
      insuredAmount: '10000000',
    };
    const record = await firstValueFrom(
      gateway.submitRequest({ productId: 'parametric-weather', productData }),
    );
    expect(record.productData).toEqual(productData);
    expect(record.id).toBeTruthy();
    expect(record.status).toBe('received');
  });
});

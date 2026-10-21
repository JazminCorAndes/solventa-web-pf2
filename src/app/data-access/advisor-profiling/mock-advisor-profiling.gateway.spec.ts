import { firstValueFrom } from 'rxjs';
import { MortgageProfilingRequest } from '../../core/advisor-profiling/advisor-profiling.models';
import { MockAdvisorProfilingGateway } from './mock-advisor-profiling.gateway';

describe('MockAdvisorProfilingGateway', () => {
  const request: MortgageProfilingRequest = {
    operationId: '11111111-1111-4111-8111-111111111111',
    partnerId: 'SOC-CO-001',
    customer: {
      documentType: 'cc',
      documentNumber: '1023456789',
      fullName: 'Valentina Gómez',
      email: 'valentina@example.com',
      phone: '+573001234567',
    },
    credit: { reference: 'HIP-001', amount: 310_000_000, termMonths: 240 },
    consentReference: 'CONS-001',
  };

  it('devuelve la misma confirmación al repetir la misma operación', async () => {
    const gateway = new MockAdvisorProfilingGateway();
    const first = await firstValueFrom(gateway.start(request));
    const replay = await firstValueFrom(gateway.start(request));

    expect(replay).toEqual(first);
  });

  it('rechaza una colisión del operationId con otros datos', async () => {
    const gateway = new MockAdvisorProfilingGateway();
    await firstValueFrom(gateway.start(request));

    await expect(
      firstValueFrom(
        gateway.start({
          ...request,
          credit: { ...request.credit, amount: 320_000_000 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('expone datos incompletos y consentimiento inválido como errores identificables', async () => {
    const gateway = new MockAdvisorProfilingGateway();

    await expect(
      firstValueFrom(
        gateway.start({ ...request, customer: { ...request.customer, fullName: '' } }),
      ),
    ).rejects.toMatchObject({ code: 'incomplete_data' });
    await expect(
      firstValueFrom(gateway.start({ ...request, consentReference: 'CONS-INVALIDO' })),
    ).rejects.toMatchObject({ code: 'invalid_consent' });
  });
});

import { firstValueFrom } from 'rxjs';
import { MortgageProfilingRequest } from '../../core/advisor-profiling/advisor-profiling.models';
import { MockAdvisorProfilingGateway } from './mock-advisor-profiling.gateway';

describe('MockAdvisorProfilingGateway', () => {
  const request: MortgageProfilingRequest = {
    operationId: '11111111-1111-4111-8111-111111111111',
    partnerId: 'SOC-CO-001',
    customer: {
      id: '44444444-4444-4444-8444-444444444444',
      documentType: 'cc',
      documentNumber: '1023456789',
      phone: '+573001234567',
      birthDate: '1985-02-10',
    },
    credit: { reference: 'HIP-001', amount: 310_000_000, termMonths: 240 },
    consent: { id: '11111111-1111-4111-8111-111111111111', version: 1 },
  };

  it('devuelve la misma confirmación al repetir la misma operación', async () => {
    const gateway = new MockAdvisorProfilingGateway();
    const first = await firstValueFrom(gateway.start(request));
    const replay = await firstValueFrom(gateway.start(request));

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      customerId: request.customer.id,
      partnerId: request.partnerId,
      productId: 'mortgage-life',
      status: 'completed',
    });
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
      firstValueFrom(gateway.start({ ...request, customer: { ...request.customer, id: '' } })),
    ).rejects.toMatchObject({ code: 'incomplete_data' });
    await expect(
      firstValueFrom(
        gateway.start({
          ...request,
          consent: { id: '00000000-0000-0000-0000-000000000000', version: 1 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_consent' });
  });
});

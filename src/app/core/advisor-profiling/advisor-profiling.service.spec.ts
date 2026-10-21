import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { ADVISOR_PROFILING_GATEWAY, AdvisorProfilingGateway } from './advisor-profiling.gateway';
import { MortgageProfilingInput, MortgageProfilingRequest } from './advisor-profiling.models';
import { AdvisorProfilingService } from './advisor-profiling.service';
import {
  ADVISOR_PROFILING_STORAGE,
  AdvisorProfilingStorage,
  PendingMortgageProfilingOperation,
} from './advisor-profiling-storage.service';

class TestStorage implements AdvisorProfilingStorage {
  value: PendingMortgageProfilingOperation | null = null;

  read(): PendingMortgageProfilingOperation | null {
    return this.value;
  }

  write(operation: PendingMortgageProfilingOperation): void {
    this.value = operation;
  }

  clear(): void {
    this.value = null;
  }
}

describe('AdvisorProfilingService', () => {
  const requests: MortgageProfilingRequest[] = [];
  const storage = new TestStorage();
  const gateway: AdvisorProfilingGateway = {
    start: (request) => {
      requests.push(request);
      return of({
        operationId: request.operationId,
        profilingReference: 'PRF-HIP-001',
        status: 'processing',
        receivedAt: '2026-10-20T12:00:00Z',
      });
    },
  };
  const input: MortgageProfilingInput = {
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

  beforeEach(() => {
    requests.length = 0;
    storage.clear();
    TestBed.configureTestingModule({
      providers: [
        AdvisorProfilingService,
        { provide: ADVISOR_PROFILING_GATEWAY, useValue: gateway },
        { provide: ADVISOR_PROFILING_STORAGE, useValue: storage },
      ],
    });
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
  });

  afterEach(() => vi.restoreAllMocks());

  it('conserva el operationId al reintentar los mismos datos', async () => {
    const service = TestBed.inject(AdvisorProfilingService);

    await firstValueFrom(service.start(input));
    await firstValueFrom(service.start(input));

    expect(requests).toHaveLength(2);
    expect(requests[0].operationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(requests[1].operationId).toBe(requests[0].operationId);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('crea otra operación cuando cambian los datos y permite reiniciarla', async () => {
    const service = TestBed.inject(AdvisorProfilingService);

    await firstValueFrom(service.start(input));
    await firstValueFrom(
      service.start({ ...input, credit: { ...input.credit, amount: 320_000_000 } }),
    );
    expect(requests[1].operationId).toBe('22222222-2222-4222-8222-222222222222');

    service.reset();
    expect(storage.value).toBeNull();
  });
});

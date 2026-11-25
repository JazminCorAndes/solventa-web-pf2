import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { PARTNER_PROFILING_GATEWAY, PartnerProfilingGateway } from './advisor-profiling.gateway';
import {
  MortgageProfilingError,
  MortgageProfilingInput,
  MortgageProfilingRequest,
} from './advisor-profiling.models';
import { PartnerProfilingService } from './advisor-profiling.service';
import {
  PARTNER_PROFILING_STORAGE,
  PartnerProfilingStorage,
  PendingMortgageProfilingOperation,
} from './advisor-profiling-storage.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.models';
import { PartnerContext, PartnerContextService } from '../partners/partner-context.service';

class TestStorage implements PartnerProfilingStorage {
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

describe('PartnerProfilingService', () => {
  const requests: MortgageProfilingRequest[] = [];
  const storage = new TestStorage();
  const advisor: AuthUser = {
    id: 'advisor-test',
    name: 'Asesor de prueba',
    email: 'asesor@example.com',
    role: 'partner',
    partnerIds: ['SOC-CO-001', 'OTRO-SOCIO'],
  };
  const user = signal<AuthUser | null>(null);
  const context = signal<PartnerContext | null>(null);
  const gateway: PartnerProfilingGateway = {
    start: (request) => {
      requests.push(request);
      return of({
        operationId: request.operationId,
        partnerId: request.partnerId,
        customerId: request.customer.id,
        productId: 'mortgage-life',
        profilingReference: 'PRF-HIP-001',
        quoteRequestId: 'AQT-2026-ABC123',
        quoteId: '33333333-3333-4333-8333-333333333333',
        status: 'completed',
        receivedAt: '2026-10-20T12:00:00Z',
      });
    },
  };
  const input: MortgageProfilingInput = {
    partnerId: 'SOC-CO-001',
    consultationId: '77777777-7777-4777-8777-777777777777',
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

  beforeEach(() => {
    requests.length = 0;
    storage.clear();
    user.set(advisor);
    context.set({
      apiVersion: '1',
      usuario: {
        id: advisor.id,
        nombre: advisor.name,
        correo: advisor.email,
        rol: 'socio',
        socios: advisor.partnerIds!,
      },
      socios: advisor.partnerIds!.map((socioId) => ({ socioId, productos: ['mortgage-life'] })),
      alcances: ['clientes:consultar', 'perfilamientos:crear'],
    });
    TestBed.configureTestingModule({
      providers: [
        PartnerProfilingService,
        { provide: PARTNER_PROFILING_GATEWAY, useValue: gateway },
        { provide: PARTNER_PROFILING_STORAGE, useValue: storage },
        { provide: AuthService, useValue: { user } },
        { provide: PartnerContextService, useValue: { context } },
      ],
    });
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
  });

  afterEach(() => vi.restoreAllMocks());

  it('conserva el operationId al reintentar los mismos datos', async () => {
    const service = TestBed.inject(PartnerProfilingService);

    await firstValueFrom(service.start(input));
    await firstValueFrom(service.start(input));

    expect(requests).toHaveLength(2);
    expect(requests[0].operationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(requests[1].operationId).toBe(requests[0].operationId);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('rechaza cambios de datos sin cambiar UUID hasta reiniciar explícitamente', async () => {
    const service = TestBed.inject(PartnerProfilingService);

    await firstValueFrom(service.start(input));
    await expect(
      firstValueFrom(service.start({ ...input, credit: { ...input.credit, amount: 320_000_000 } })),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    expect(requests).toHaveLength(1);
    expect(storage.read()?.operationId).toBe(requests[0].operationId);

    service.reset();
    expect(storage.value).toBeNull();
    await firstValueFrom(service.start(input));
    expect(requests[1].operationId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('conserva operación y contexto después de un fallo y al recuperar el servicio', async () => {
    const start = vi.spyOn(gateway, 'start');
    start.mockReturnValueOnce(throwError(() => new MortgageProfilingError('service_unavailable')));
    await expect(
      firstValueFrom(TestBed.inject(PartnerProfilingService).start(input)),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
    const pending = storage.read();

    const restored = TestBed.runInInjectionContext(() => new PartnerProfilingService());
    await firstValueFrom(restored.start(input));
    expect(start.mock.calls[1][0]).toEqual(start.mock.calls[0][0]);
    expect(storage.read()).toEqual(pending);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...input, partnerId: 'OTRO-SOCIO' },
    { ...input, customer: { ...input.customer, id: '55555555-5555-4555-8555-555555555555' } },
    { ...input, consent: { ...input.consent, version: 2 } },
  ])(
    'exige reinicio explícito al cambiar el contexto de una operación pendiente %#',
    async (changed) => {
      const service = TestBed.inject(PartnerProfilingService);
      await firstValueFrom(service.start(input));
      await expect(firstValueFrom(service.start(changed))).rejects.toMatchObject({
        code: 'idempotency_conflict',
      });
      service.reset();
      await firstValueFrom(service.start(changed));
      expect(requests[1].operationId).not.toBe(requests[0].operationId);
    },
  );

  it('guarda solo UUID, actor y socio, sin cuerpo ni fingerprint del cliente', async () => {
    await firstValueFrom(TestBed.inject(PartnerProfilingService).start(input));
    expect(storage.value).toEqual({
      ownerId: advisor.id,
      partnerId: input.partnerId,
      operationId: '11111111-1111-4111-8111-111111111111',
    });
    const serialized = JSON.stringify(storage.value);
    for (const value of [
      input.customer.id,
      input.customer.documentNumber,
      input.customer.phone,
      input.customer.birthDate,
      input.credit.reference,
      String(input.credit.amount),
      'fingerprint',
      'customer',
      'credit',
      'consent',
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it('deja que el backend valide el replay tras recarga, sin inventar otra operación', async () => {
    storage.value = {
      ownerId: advisor.id,
      partnerId: input.partnerId,
      operationId: '66666666-6666-4666-8666-666666666666',
    };
    const service = TestBed.inject(PartnerProfilingService);
    await firstValueFrom(service.start(input));
    await firstValueFrom(
      service.start({ ...input, credit: { ...input.credit, amount: 320000000 } }),
    );
    expect(requests.map((request) => request.operationId)).toEqual([
      storage.value.operationId,
      storage.value.operationId,
    ]);
    expect(globalThis.crypto.randomUUID).not.toHaveBeenCalled();
    service.reset();
    await firstValueFrom(service.start(input));
    expect(requests[2].operationId).not.toBe(requests[0].operationId);
  });

  it('no reutiliza la operación de otro usuario socio', async () => {
    const service = TestBed.inject(PartnerProfilingService);
    await firstValueFrom(service.start(input));
    user.set({ ...advisor, id: 'otro-asesor' });
    context.update(
      (value) => value && { ...value, usuario: { ...value.usuario, id: 'otro-asesor' } },
    );
    await firstValueFrom(service.start(input));
    expect(requests[1].operationId).not.toBe(requests[0].operationId);
    expect(storage.value?.ownerId).toBe('otro-asesor');
  });

  it.each(['logout', 'client', 'revoked'])(
    'limpia metadatos al invalidar el contexto: %s',
    async (change) => {
      const service = TestBed.inject(PartnerProfilingService);
      await firstValueFrom(service.start(input));
      TestBed.tick();
      user.set(
        change === 'logout'
          ? null
          : {
              ...advisor,
              role: change === 'client' ? 'client' : 'partner',
              partnerIds: [],
            },
      );
      TestBed.tick();
      expect(storage.read()).toBeNull();
    },
  );

  it('conserva la operación al renovar la sesión del mismo socio', async () => {
    const service = TestBed.inject(PartnerProfilingService);
    await firstValueFrom(service.start(input));
    TestBed.tick();
    const pending = storage.read();
    user.set({ ...advisor, partnerIds: [...advisor.partnerIds!, 'SOCIO-NUEVO'] });
    TestBed.tick();
    expect(storage.read()).toEqual(pending);
    await firstValueFrom(service.start(input));
    expect(requests[1].operationId).toBe(requests[0].operationId);
  });

  it.each(['advisor', 'scope', 'product', 'owner'])(
    'rechaza originación sin autorización comercial: %s',
    async (change) => {
      const service = TestBed.inject(PartnerProfilingService);
      if (change === 'advisor') user.set({ ...advisor, role: 'advisor' });
      else
        context.update(
          (value) =>
            value && {
              ...value,
              alcances: change === 'scope' ? [] : value.alcances,
              socios:
                change === 'product' ? [{ socioId: input.partnerId, productos: [] }] : value.socios,
              usuario: { ...value.usuario, id: change === 'owner' ? 'otro-usuario' : advisor.id },
            },
        );
      await expect(firstValueFrom(service.start(input))).rejects.toMatchObject({
        code: 'unauthorized_partner',
      });
      expect(requests).toHaveLength(0);
      expect(storage.read()).toBeNull();
    },
  );
});

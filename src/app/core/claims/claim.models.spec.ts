import { eventWithinPolicy, isClaimInput, isClaimRecord, isPolicyDate } from './claim.models';

const policy = {
  id: '11111111-1111-4111-8111-111111111111',
  tipo: 'automotive',
  fechaInicio: '2025-01-10',
  fechaFin: '2025-01-11',
  estado: 'vigente',
};
const input = {
  polizaId: policy.id,
  fechaEvento: '2025-01-10T12:00:00Z',
  tipoEvento: 'a',
  descripcion: 'a'.repeat(10),
  lugar: 'a',
};

describe('Claim contract validation', () => {
  it('accepts minimum and maximum permitted text lengths', () => {
    expect(isClaimInput(input)).toBe(true);
    expect(
      isClaimInput({
        ...input,
        tipoEvento: 'a'.repeat(100),
        descripcion: 'a'.repeat(5000),
        lugar: 'a'.repeat(300),
      }),
    ).toBe(true);
  });

  it.each([
    { ...input, tipoEvento: '' },
    { ...input, tipoEvento: 'a'.repeat(101) },
    { ...input, descripcion: 'a'.repeat(9) },
    { ...input, descripcion: 'a'.repeat(5001) },
    { ...input, lugar: '' },
    { ...input, lugar: 'a'.repeat(301) },
    { ...input, fechaEvento: '2025-01-10T12:00:00' },
    { ...input, fechaEvento: '2025-02-30T12:00:00Z' },
    { ...input, fechaEvento: '2025-01-10T24:00:00Z' },
    { ...input, polizaId: 'invalid' },
  ])('rejects values outside the exact API bounds', (value) => {
    expect(isClaimInput(value)).toBe(false);
  });

  it('requires a valid ID and registered state in a confirmation', () => {
    const record = {
      ...input,
      id: '22222222-2222-4222-8222-222222222222',
      estado: 'registrado',
      registradoEn: '2025-01-10T13:00:00Z',
    };
    expect(isClaimRecord(record)).toBe(true);
    expect(isClaimRecord({ ...record, id: '' })).toBe(false);
    expect(isClaimRecord({ ...record, estado: 'pendiente' })).toBe(false);
  });

  it('rejects normalized but nonexistent policy dates', () => {
    expect(isPolicyDate('2025-02-28')).toBe(true);
    expect(isPolicyDate('2025-02-30')).toBe(false);
    expect(isPolicyDate('2025-01-10T12:00:00Z')).toBe(false);
  });

  it('includes both policy coverage boundary days', () => {
    expect(eventWithinPolicy(policy, new Date(2025, 0, 10, 0, 0))).toBe(true);
    expect(eventWithinPolicy(policy, new Date(2025, 0, 11, 23, 59))).toBe(true);
    expect(eventWithinPolicy(policy, new Date(2025, 0, 9, 23, 59))).toBe(false);
    expect(eventWithinPolicy(policy, new Date(2025, 0, 12, 0, 0))).toBe(false);
    expect(eventWithinPolicy(policy, new Date('invalid'))).toBe(false);
  });
});

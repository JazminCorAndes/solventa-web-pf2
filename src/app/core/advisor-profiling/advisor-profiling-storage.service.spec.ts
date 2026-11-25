import { TestBed } from '@angular/core/testing';
import { BrowserPartnerProfilingStorage } from './advisor-profiling-storage.service';

const KEY = 'solventa.partner.mortgage-profiling-operation';
const OPERATION = {
  ownerId: 'advisor-test',
  partnerId: 'BANCO-001',
  operationId: '11111111-1111-4111-8111-111111111111',
};

describe('BrowserPartnerProfilingStorage', () => {
  let storage: BrowserPartnerProfilingStorage;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [BrowserPartnerProfilingStorage] });
    storage = TestBed.inject(BrowserPartnerProfilingStorage);
  });

  it('persiste únicamente metadatos y omite propiedades adicionales', () => {
    const extended = { ...OPERATION, fingerprint: 'datos-sinteticos-del-cliente' };
    storage.write(extended);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(OPERATION);
    expect(storage.read()).toEqual(OPERATION);
  });

  it.each([
    { fingerprint: 'datos-sinteticos-del-cliente', operationId: OPERATION.operationId },
    { ...OPERATION, fingerprint: 'datos-sinteticos-del-cliente' },
    { ...OPERATION, operationId: 'invalido' },
    { ...OPERATION, ownerId: '' },
    { ...OPERATION, partnerId: '' },
    null,
  ])('descarta registros anteriores o inválidos sin conservar datos de cliente %#', (value) => {
    sessionStorage.setItem(KEY, JSON.stringify(value));
    expect(storage.read()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('limpia JSON inválido y permite borrar la operación', () => {
    sessionStorage.setItem(KEY, '{');
    expect(storage.read()).toBeNull();
    storage.write(OPERATION);
    storage.clear();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

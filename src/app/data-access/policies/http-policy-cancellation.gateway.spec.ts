import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  CANCELLATION_POLICY_ID,
  CANCELLATION_STATE_RESPONSE,
  SETTLEMENT_RESPONSE,
} from '../../core/policies/policy-cancellation.testing';
import { HttpPolicyCancellationGateway } from './http-policy-cancellation.gateway';

const BASE = `${environment.apiBaseUrl}/v1/clientes/me/polizas/${CANCELLATION_POLICY_ID}`;

describe('HttpPolicyCancellationGateway contract validation', () => {
  let gateway: HttpPolicyCancellationGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpPolicyCancellationGateway],
    });
    gateway = TestBed.inject(HttpPolicyCancellationGateway);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it.each([
    { ...CANCELLATION_STATE_RESPONSE, polizaId: '00000000-0000-4000-8000-000000000001' },
    { ...CANCELLATION_STATE_RESPONSE, cancelable: 'true' },
    { ...CANCELLATION_STATE_RESPONSE, cancelable: false },
    { ...CANCELLATION_STATE_RESPONSE, estado: 'cancelada' },
    { ...CANCELLATION_STATE_RESPONSE, motivo: 'desconocido' },
    {
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: { ...SETTLEMENT_RESPONSE, devolucion: { monto: 41129, moneda: 'COP' } },
    },
    {
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: { ...SETTLEMENT_RESPONSE, finCobertura: '2026-02-31' },
    },
    {
      ...CANCELLATION_STATE_RESPONSE,
      liquidacion: { ...SETTLEMENT_RESPONSE, liquidacionHash: 'invalid' },
    },
  ])('does not expose malformed or mismatched state %#', (response) => {
    const error = vi.fn();
    const next = vi.fn();
    gateway.state(CANCELLATION_POLICY_ID).subscribe({ next, error });
    http.expectOne(`${BASE}/cancelacion`).flush(response);
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.any(Error));
  });
});

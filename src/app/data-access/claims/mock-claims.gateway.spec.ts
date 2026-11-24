import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ClaimInput } from '../../core/claims/claim.models';
import {
  MOCK_PARAMETRIC_CLAIM_ID,
  MOCK_POLICY_ID,
} from '../../../testing/data-access/mock/mock.constants';
import { MockClaimEvidenceGateway } from '../../../testing/data-access/claims/mock-claim-evidence.gateway';
import { MockClaimGateway } from '../../../testing/data-access/claims/mock-claim.gateway';
import { MockClaimStatusGateway } from '../../../testing/data-access/claims/mock-claim-status.gateway';

const KEY = '33333333-3333-4333-8333-333333333333';
const PAYLOAD: ClaimInput = {
  polizaId: MOCK_POLICY_ID,
  fechaEvento: '2026-11-15T12:00:00Z',
  tipoEvento: 'Colisión leve',
  descripcion: 'Daño visible en la parte delantera del vehículo.',
  lugar: 'Bogotá, Colombia',
};

describe('Mock claims and evidence gateways', () => {
  let claims: MockClaimGateway;
  let statuses: MockClaimStatusGateway;
  let evidence: MockClaimEvidenceGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MockClaimGateway, MockClaimStatusGateway, MockClaimEvidenceGateway],
    });
    claims = TestBed.inject(MockClaimGateway);
    statuses = TestBed.inject(MockClaimStatusGateway);
    evidence = TestBed.inject(MockClaimEvidenceGateway);
  });

  it('publishes a paid parametric claim and idempotent assisted reports', async () => {
    const paid = await firstValueFrom(statuses.load(MOCK_PARAMETRIC_CLAIM_ID));
    expect(paid).toMatchObject({ type: 'parametrico', state: 'pagado' });

    const first = await firstValueFrom(claims.report(PAYLOAD, KEY));
    const replay = await firstValueFrom(claims.report(PAYLOAD, KEY));
    expect(replay).toEqual(first);
    expect(await firstValueFrom(statuses.load(first.id))).toMatchObject({
      type: 'asistido',
      state: 'reportado',
    });
    const list = await firstValueFrom(claims.list());
    expect(list.filter((record) => record.id === first.id)).toEqual([first]);
    expect(list.find((record) => record.id === MOCK_PARAMETRIC_CLAIM_ID)?.estado).toBe(
      'registrado',
    );
    list[0].descripcion = 'Changed outside the store';
    expect((await firstValueFrom(claims.list()))[0].descripcion).not.toBe(
      'Changed outside the store',
    );
  });

  it('uploads, confirms, lists and downloads evidence in memory', async () => {
    const request = {
      mimeType: 'image/png' as const,
      tamanoBytes: 3,
      sha256: 'a'.repeat(64),
    };
    const started = await firstValueFrom(evidence.start(MOCK_PARAMETRIC_CLAIM_ID, request, KEY));
    const uploaded = await firstValueFrom(
      evidence.chunk(
        MOCK_PARAMETRIC_CLAIM_ID,
        started.id,
        request,
        0,
        new Blob([new Uint8Array([1, 2, 3])], { type: request.mimeType }),
      ),
    );
    expect(uploaded.offset).toBe(3);

    const confirmed = await firstValueFrom(
      evidence.confirm(MOCK_PARAMETRIC_CLAIM_ID, started.id, request),
    );
    expect(confirmed.estado).toBe('confirmada');
    const listed = await firstValueFrom(evidence.list(MOCK_PARAMETRIC_CLAIM_ID));
    expect(listed).toHaveLength(1);
    expect((await firstValueFrom(evidence.content(MOCK_PARAMETRIC_CLAIM_ID, listed[0]))).size).toBe(
      3,
    );
  });
});

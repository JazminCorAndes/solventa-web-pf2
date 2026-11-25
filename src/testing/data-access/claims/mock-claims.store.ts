import { Injectable } from '@angular/core';
import { ClaimStatus } from '../../../app/core/claims/claim-status.models';
import {
  ClaimInput,
  ClaimPolicy,
  ClaimRecord,
  sameClaimInput,
} from '../../../app/core/claims/claim.models';
import { MOCK_PARAMETRIC_CLAIM_ID, MOCK_POLICY_ID } from '../mock/mock.constants';

@Injectable({ providedIn: 'root' })
export class MockClaimsStore {
  private readonly attempts = new Map<string, ClaimRecord>();
  private readonly records = new Map<string, ClaimRecord>([
    [
      MOCK_PARAMETRIC_CLAIM_ID,
      {
        id: MOCK_PARAMETRIC_CLAIM_ID,
        polizaId: MOCK_POLICY_ID,
        fechaEvento: '2026-11-14T15:00:00Z',
        tipoEvento: 'Evento paramétrico',
        descripcion: 'Reporte académico de un evento paramétrico.',
        lugar: 'Bogotá, Colombia',
        estado: 'registrado',
        registradoEn: '2026-11-14T15:01:00Z',
      },
    ],
  ]);
  private readonly statuses = new Map<string, ClaimStatus>([
    [
      MOCK_PARAMETRIC_CLAIM_ID,
      {
        id: MOCK_PARAMETRIC_CLAIM_ID,
        policyId: MOCK_POLICY_ID,
        type: 'parametrico',
        state: 'pagado',
        description: 'El pago paramétrico fue confirmado automáticamente.',
        occurredAt: '2026-11-14T15:00:00Z',
        reportedAt: '2026-11-14T15:01:00Z',
        updatedAt: '2026-11-15T19:28:03Z',
        history: [
          {
            state: 'reportado',
            description: 'El evento paramétrico fue recibido.',
            occurredAt: '2026-11-14T15:01:00Z',
          },
          {
            state: 'aprobado',
            description: 'El evento cumplió la regla paramétrica versionada.',
            occurredAt: '2026-11-15T19:27:30Z',
          },
          {
            state: 'pagado',
            description: 'El pago paramétrico fue realizado sin intervención manual.',
            occurredAt: '2026-11-15T19:28:03Z',
          },
        ],
      },
    ],
  ]);

  policies(): ClaimPolicy[] {
    return [
      {
        id: MOCK_POLICY_ID,
        tipo: 'automotive',
        fechaInicio: '2026-11-01',
        fechaFin: '2026-12-31',
        estado: 'vigente',
      },
    ];
  }

  report(payload: ClaimInput, key: string): ClaimRecord {
    const previous = this.attempts.get(key);
    if (previous) {
      if (!sameClaimInput(previous, payload)) {
        throw new Error('Mock claim idempotency conflict.');
      }
      return structuredClone(previous);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: ClaimRecord = {
      ...payload,
      id,
      estado: 'registrado',
      registradoEn: now,
    };
    this.attempts.set(key, record);
    this.records.set(id, record);
    this.statuses.set(id, {
      id,
      policyId: payload.polizaId,
      type: 'asistido',
      state: 'reportado',
      description: 'El siniestro fue reportado y será evaluado.',
      occurredAt: payload.fechaEvento,
      reportedAt: now,
      updatedAt: now,
      history: [
        {
          state: 'reportado',
          description: 'El siniestro fue reportado y será evaluado.',
          occurredAt: now,
        },
      ],
    });
    return structuredClone(record);
  }

  list(): ClaimRecord[] {
    return structuredClone(
      [...this.records.values()].sort(
        (left, right) =>
          Date.parse(right.registradoEn) - Date.parse(left.registradoEn) ||
          right.id.localeCompare(left.id),
      ),
    );
  }

  record(id: string): ClaimRecord | null {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  status(id: string): ClaimStatus | null {
    const status = this.statuses.get(id);
    return status ? structuredClone(status) : null;
  }

  has(id: string): boolean {
    return this.statuses.has(id);
  }
}

export interface ClaimPolicy {
  id: string;
  tipo: string;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
}

export interface ClaimInput {
  polizaId: string;
  fechaEvento: string;
  tipoEvento: string;
  descripcion: string;
  lugar: string;
}

export interface ClaimRecord extends ClaimInput {
  id: string;
  estado: 'registrado';
  registradoEn: string;
}

export interface ClaimAttempt {
  key: string;
  payload: ClaimInput;
  claimId?: string;
}

export const CLAIM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    TIMESTAMP.test(value) &&
    isPolicyDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}

export function isPolicyDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function isClaimInput(value: unknown): value is ClaimInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<ClaimInput>;
  return (
    typeof input.polizaId === 'string' &&
    CLAIM_UUID.test(input.polizaId) &&
    isTimestamp(input.fechaEvento) &&
    validText(input.tipoEvento, 1, 100) &&
    validText(input.descripcion, 10, 5000) &&
    validText(input.lugar, 1, 300)
  );
}

export function sameClaimInput(left: ClaimInput, right: ClaimInput): boolean {
  return (
    left.polizaId === right.polizaId &&
    Date.parse(left.fechaEvento) === Date.parse(right.fechaEvento) &&
    left.tipoEvento === right.tipoEvento &&
    left.descripcion === right.descripcion &&
    left.lugar === right.lugar
  );
}

export function isClaimRecord(value: unknown): value is ClaimRecord {
  if (!isClaimInput(value)) return false;
  const record = value as Partial<ClaimRecord>;
  return (
    typeof record.id === 'string' &&
    CLAIM_UUID.test(record.id) &&
    record.estado === 'registrado' &&
    isTimestamp(record.registradoEn)
  );
}

export function eventWithinPolicy(policy: ClaimPolicy | undefined, date: Date): boolean {
  if (!policy || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()) return false;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return day >= policy.fechaInicio && day <= policy.fechaFin;
}

function validText(value: unknown, min: number, max: number): boolean {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { PartnerClientLookup, UUID_PATTERN } from '../quotes/http-partner-quote.gateway';
import { DocumentType } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';

export interface QuotedPartnerClient {
  clienteId: string;
  nombre: string | null;
  tipoDocumento: DocumentType | null;
  numeroDocumentoEnmascarado: string | null;
  consentimientoEstado: PartnerClientLookup['consentimientoEstado'];
}

@Injectable({ providedIn: 'root' })
export class HttpPartnerClientsGateway {
  private readonly http = inject(HttpClient);

  list(socioId: string): Observable<QuotedPartnerClient[]> {
    return this.http
      .get<unknown>(`${environment.apiBaseUrl}/v1/socios/clientes`, {
        params: { socioId, productoId: 'mortgage-life' },
        headers: { 'API-Version': '1' },
      })
      .pipe(map(parseClients));
  }
}

function parseClients(body: unknown): QuotedPartnerClient[] {
  if (!body || typeof body !== 'object' || !('clientes' in body) || !Array.isArray(body.clientes)) {
    throw new Error('Invalid quoted clients response.');
  }
  const clients = new Map<string, QuotedPartnerClient>();
  for (const value of body.clientes) {
    if (!isQuotedPartnerClient(value)) throw new Error('Invalid quoted client.');
    const key = value.clienteId.toLowerCase();
    const previous = clients.get(key);
    if (
      previous &&
      (previous.nombre !== value.nombre ||
        previous.tipoDocumento !== value.tipoDocumento ||
        previous.numeroDocumentoEnmascarado !== value.numeroDocumentoEnmascarado ||
        previous.consentimientoEstado !== value.consentimientoEstado)
    ) {
      throw new Error('Conflicting quoted client.');
    }
    if (!previous) {
      clients.set(key, {
        clienteId: value.clienteId,
        nombre: value.nombre,
        tipoDocumento: value.tipoDocumento,
        numeroDocumentoEnmascarado: value.numeroDocumentoEnmascarado,
        consentimientoEstado: value.consentimientoEstado,
      });
    }
  }
  return [...clients.values()].sort((a, b) =>
    a.clienteId.toLowerCase().localeCompare(b.clienteId.toLowerCase()),
  );
}

export function isQuotedPartnerClient(value: unknown): value is QuotedPartnerClient {
  if (!value || typeof value !== 'object') return false;
  return (
    'clienteId' in value &&
    typeof value.clienteId === 'string' &&
    UUID_PATTERN.test(value.clienteId) &&
    'nombre' in value &&
    (value.nombre === null || (typeof value.nombre === 'string' && !!value.nombre.trim())) &&
    'tipoDocumento' in value &&
    (value.tipoDocumento === null ||
      (typeof value.tipoDocumento === 'string' &&
        ['cc', 'ce', 'passport', 'ppt'].includes(value.tipoDocumento))) &&
    'numeroDocumentoEnmascarado' in value &&
    (value.numeroDocumentoEnmascarado === null ||
      (typeof value.numeroDocumentoEnmascarado === 'string' &&
        value.numeroDocumentoEnmascarado.includes('*'))) &&
    (value.tipoDocumento === null) === (value.numeroDocumentoEnmascarado === null) &&
    'consentimientoEstado' in value &&
    typeof value.consentimientoEstado === 'string' &&
    ['vigente', 'insuficiente', 'ausente', 'rechazado', 'revocado', 'vencido'].includes(
      value.consentimientoEstado,
    ) &&
    (value.consentimientoEstado === 'vigente' ||
      (value.nombre === null &&
        value.tipoDocumento === null &&
        value.numeroDocumentoEnmascarado === null))
  );
}

export function partnerClientsErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'partners.errors.expired';
    if (error.status === 403) return 'partners.errors.forbidden';
  }
  return 'partnerClients.unavailable';
}

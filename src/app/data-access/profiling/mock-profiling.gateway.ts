import { inject, Injectable } from '@angular/core';
import { defer, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilingError } from '../../core/profiling/profiling.errors';
import { ProfilingGateway } from '../../core/profiling/profiling.gateway';
import {
  consentIsCurrent,
  consentRequestIssues,
  ConsentDecision,
  ProfilingConsent,
  RiskProfile,
} from '../../core/profiling/profiling.models';

@Injectable()
export class MockProfilingGateway implements ProfilingGateway {
  private readonly auth = inject(AuthService);
  private readonly consents = new Map<string, ProfilingConsent>();
  private readonly profiles = new Map<string, RiskProfile>();

  loadConsent(): Observable<ProfilingConsent | null> {
    return defer(() => {
      const id = this.customerId();
      const consent = this.consents.get(id);
      return of(
        consent?.estado === 'autorizado' && Date.parse(consent.vigenteHasta) <= Date.now()
          ? { ...consent, estado: 'vencido' as const }
          : (consent ?? null),
      );
    });
  }

  saveConsent(decision: ConsentDecision): Observable<ProfilingConsent> {
    return defer(() => {
      const { autorizado: authorized, version, solicitud } = decision;
      const id = this.customerId();
      const current = this.consents.get(id);
      if ((current?.version ?? 0) !== version) {
        return throwError(() => new ProfilingError('conflicto_version'));
      }
      if (solicitud && consentRequestIssues(solicitud, Date.now()).length) {
        return throwError(() => new ProfilingError('solicitud_invalida'));
      }
      if (!solicitud && (!current || current.estado !== 'autorizado')) {
        return throwError(() => new ProfilingError('consentimiento_no_vigente'));
      }
      const evidence = solicitud ?? current!;
      const consent: ProfilingConsent = {
        consentimientoId: current?.consentimientoId ?? crypto.randomUUID(),
        clienteId: id,
        version: version + 1,
        estado: authorized ? 'autorizado' : solicitud ? 'rechazado' : 'revocado',
        actorId: id,
        finalidad: evidence.finalidad,
        alcances: [...evidence.alcances],
        fuentes: evidence.fuentes ? [...evidence.fuentes] : undefined,
        datos: evidence.datos ? [...evidence.datos] : undefined,
        versionTerminos: evidence.versionTerminos,
        efectivaEn: new Date().toISOString(),
        vigenteHasta: evidence.vigenteHasta,
      };
      this.consents.set(id, consent);
      return of(consent);
    });
  }

  createProfile(requestId: string): void {
    const id = this.customerId();
    const consent = this.consents.get(id) ?? null;
    if (!consentIsCurrent(consent) || !consent) {
      throw new ProfilingError('consentimiento_no_vigente');
    }
    const now = new Date().toISOString();
    const until = new Date(Date.now() + 15 * 60000).toISOString();
    this.profiles.set(`${id}:${requestId}`, {
      solicitudId: requestId,
      perfilId: crypto.randomUUID(),
      version: 1,
      modeloVersion: 'simulado-v1',
      score: '0.25',
      nivel: 'A',
      consentimientoId: consent.consentimientoId,
      consentimientoVersion: consent.version,
      calculadoEn: now,
      vigenteHasta: until,
      fuentes: (['open_finance', 'open_data'] as const).map((nombre) => ({
        nombre,
        version: 'simulada-v1',
        consultadaEn: now,
        vigenteHasta: until,
        simulada: true,
        indicadorRiesgo: '0.25',
      })),
      fallbackUsed: false,
    });
  }

  loadProfile(requestId: string): Observable<RiskProfile> {
    return defer(() => {
      const id = this.customerId();
      const consent = this.consents.get(id);
      if (!consentIsCurrent(consent ?? null)) {
        return throwError(() => new ProfilingError('consentimiento_no_vigente'));
      }
      const profile = this.profiles.get(`${id}:${requestId}`);
      if (!profile || Date.parse(profile.vigenteHasta) <= Date.now()) {
        return throwError(() => new ProfilingError('perfil_vencido'));
      }
      if (profile.consentimientoVersion !== consent?.version) {
        return throwError(() => new ProfilingError('consentimiento_no_vigente'));
      }
      return of(profile);
    });
  }

  private customerId(): string {
    if (!this.auth.hasActiveSession()) {
      throw new ProfilingError('sesion_ausente');
    }
    const id = this.auth.user()?.id;
    if (!id) {
      throw new ProfilingError('sesion_ausente');
    }
    return id;
  }
}

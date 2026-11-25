import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpAdministrationGateway } from './http-administration.gateway';

const ID = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const BASE = `${environment.apiBaseUrl}/v1/administracion`;
const TIME = '2026-11-25T10:00:00Z';
const ASSIGNMENT = {
  id: KEY,
  siniestroId: ID,
  tipo: 'cola',
  destino: 'revision',
  estado: 'activa',
  asignadaEn: TIME,
  cerradaEn: null,
};
const DECISION = {
  id: KEY,
  siniestroId: ID,
  operacionId: KEY,
  origen: 'humana',
  actor: { tipo: 'revisor', id: ID },
  resultado: 'aprobado',
  motivo: 'Revisión documentada',
  estadoAnterior: 'en_revision',
  estadoNuevo: 'aprobado',
  decididaEn: TIME,
  asignacion: null,
};
const EVIDENCE = {
  id: KEY,
  siniestroId: ID,
  autorId: ID,
  mimeType: 'image/png',
  tamanoBytes: 3,
  sha256: 'a'.repeat(64),
  creadaEn: TIME,
  fechaCaptura: null,
  ubicacion: null,
};

describe('HttpAdministrationGateway', () => {
  let gateway: HttpAdministrationGateway;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HttpAdministrationGateway, provideHttpClient(), provideHttpClientTesting()],
    });
    gateway = TestBed.inject(HttpAdministrationGateway);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta la cola confirmada y rechaza respuestas de otra cola', async () => {
    const result = firstValueFrom(gateway.queue('revision'));
    http.expectOne(`${BASE}/colas-revision/revision/asignaciones`).flush({
      tipo: 'cola',
      destino: 'revision',
      asignaciones: [{ ...ASSIGNMENT, estadoSiniestro: 'en_revision' }],
    });
    expect(await result).toEqual([{ ...ASSIGNMENT, estadoSiniestro: 'en_revision' }]);
    const wrong = firstValueFrom(gateway.queue('fraude'));
    const rejected = expect(wrong).rejects.toThrow();
    http.expectOne(`${BASE}/colas-revision/fraude/asignaciones`).flush({
      tipo: 'cola',
      destino: 'revision',
      asignaciones: [],
    });
    await rejected;
  });

  it.each([200, 201])(
    'envía sólo resultado/motivo y valida la operación idempotente (%s)',
    async (status) => {
      const result = firstValueFrom(
        gateway.decide(
          ID,
          {
            resultado: 'aprobado',
            motivo: DECISION.motivo,
          },
          KEY,
        ),
      );
      const request = http.expectOne(`${BASE}/siniestros/${ID}/decisiones/revision`);
      expect(request.request.headers.get('Idempotency-Key')).toBe(KEY);
      expect(request.request.body).toEqual({ resultado: 'aprobado', motivo: DECISION.motivo });
      expect(request.request.headers.has('internalToken')).toBe(false);
      request.flush(DECISION, { status, statusText: 'OK' });
      expect((await result).operacionId).toBe(KEY);
    },
  );

  it('no da por confirmado un resultado de otra operación', async () => {
    const result = firstValueFrom(
      gateway.decide(
        ID,
        {
          resultado: 'aprobado',
          motivo: DECISION.motivo,
        },
        KEY,
      ),
    );
    const rejected = expect(result).rejects.toThrow();
    http.expectOne(`${BASE}/siniestros/${ID}/decisiones/revision`).flush({
      ...DECISION,
      operacionId: ID,
    });
    await rejected;
  });

  it('separa aviso registrado, evidencia con consentimiento y estado vigente', async () => {
    const result = firstValueFrom(gateway.claim(ID));
    http.expectOne(`${BASE}/siniestros/${ID}`).flush({
      siniestro: {
        id: ID,
        polizaId: KEY,
        fechaEvento: TIME,
        tipoEvento: 'Incidente',
        descripcion: 'Descripción sintética',
        lugar: 'Bogotá',
        estado: 'registrado',
        registradoEn: TIME,
      },
      evidencias: [
        {
          ...EVIDENCE,
          ubicacion: { consentimiento: true, latitud: 4, longitud: -74, fecha: TIME },
        },
      ],
    });
    const detail = await result;
    expect(detail.siniestro.estado).toBe('registrado');
    expect(detail.evidencias[0].ubicacion?.consentimiento).toBe(true);
    const history = firstValueFrom(gateway.history(ID));
    http.expectOne(`${BASE}/siniestros/${ID}/decisiones`).flush({
      siniestroId: ID,
      estado: 'en_revision',
      asignacionActiva: ASSIGNMENT,
      decisiones: [{ ...DECISION, origen: 'automatica', motivo: '' }],
    });
    expect((await history).estado).toBe('en_revision');
  });

  it.each([403, 409, 503])('propaga HTTP %s sin convertirlo en resultado vacío', async (status) => {
    const result = firstValueFrom(gateway.history(ID));
    const rejected = expect(result).rejects.toMatchObject({ status });
    http
      .expectOne(`${BASE}/siniestros/${ID}/decisiones`)
      .flush({ code: 'servicio_no_disponible' }, { status, statusText: 'Rejected' });
    await rejected;
  });

  it('descarga contenido autenticable y rechaza bytes con tamaño o MIME distintos', async () => {
    const detail = firstValueFrom(gateway.claim(ID));
    http.expectOne(`${BASE}/siniestros/${ID}`).flush({
      siniestro: {
        id: ID,
        polizaId: KEY,
        fechaEvento: TIME,
        tipoEvento: 'Incidente',
        descripcion: 'Descripción sintética',
        lugar: 'Bogotá',
        estado: 'registrado',
        registradoEn: TIME,
      },
      evidencias: [EVIDENCE],
    });
    const evidence = (await detail).evidencias[0];
    const result = firstValueFrom(gateway.content(ID, evidence));
    const rejected = expect(result).rejects.toThrow();
    http
      .expectOne(`${BASE}/siniestros/${ID}/evidencias/${KEY}/contenido`)
      .flush(new Blob(['bad'], { type: 'text/html' }));
    await rejected;
  });
});

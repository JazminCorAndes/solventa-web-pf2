import { evidenceHash, evidenceSize, validateEvidenceFile } from './claim-evidence-file';
import { EvidencePolicy } from './claim-evidence.models';

const policy: EvidencePolicy = {
  maxCantidad: 1,
  maxChunkBytes: 4,
  maxVideoSeconds: 120,
  formatos: [
    { mimeType: 'video/mp4', maxBytes: 4 },
    { mimeType: 'image/png', maxBytes: 4 },
  ],
};

function file(type = 'image/png'): File {
  const result = new File([new Uint8Array([1, 2, 3, 4])], 'test', { type });
  Object.defineProperty(result, 'arrayBuffer', {
    value: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
  return result;
}

describe('Evidence file validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('calcula SHA256 real del contenido y acepta el tamaño límite inclusivo', async () => {
    const result = await validateEvidenceFile(file(), policy);
    expect(result.sha256).toBe('9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a');
    expect(result.tamanoBytes).toBe(4);
    await expect(evidenceHash(file())).resolves.toBe(result.sha256);
  });

  it.each([
    ['', [255, 216, 255, 224], 'image/jpeg'],
    ['image/jpg', [255, 216, 255, 224], 'image/jpeg'],
    ['image/pjpeg', [255, 216, 255, 224], 'image/jpeg'],
    ['', [137, 80, 78, 71, 13, 10, 26, 10], 'image/png'],
    ['application/x-pdf', Array.from('%PDF-1.7', (char) => char.charCodeAt(0)), 'application/pdf'],
    [
      'application/octet-stream',
      Array.from('%PDF-1.7', (char) => char.charCodeAt(0)),
      'application/pdf',
    ],
  ])('reconoce firma real para MIME ausente o alias %s', async (type, bytes, mimeType) => {
    const data = new Uint8Array(bytes);
    const selected = new File([data], 'archivo.JPEG', { type });
    Object.defineProperty(selected, 'arrayBuffer', { value: async () => data.buffer });
    vi.spyOn(selected, 'slice').mockReturnValue({ arrayBuffer: async () => data.buffer } as Blob);
    const formats: EvidencePolicy = {
      ...policy,
      formatos: [
        { mimeType: 'image/jpeg', maxBytes: 16 },
        { mimeType: 'image/png', maxBytes: 16 },
        { mimeType: 'application/pdf', maxBytes: 16 },
      ],
    };
    await expect(validateEvidenceFile(selected, formats)).resolves.toMatchObject({
      mimeType,
      tamanoBytes: data.length,
    });
    await expect(
      validateEvidenceFile(selected, { ...formats, formatos: [] }),
    ).rejects.toMatchObject({ key: 'claimEvidence.errors.format' });
  });

  it('no acepta una extensión PDF como prueba de contenido', async () => {
    const selected = new File(['not a PDF'], 'archivo.pdf');
    vi.spyOn(selected, 'slice').mockReturnValue({
      arrayBuffer: async () => new TextEncoder().encode('not a PDF').buffer,
    } as Blob);
    await expect(
      validateEvidenceFile(selected, {
        ...policy,
        formatos: [{ mimeType: 'application/pdf', maxBytes: 100 }],
      }),
    ).rejects.toMatchObject({ key: 'claimEvidence.errors.format' });
  });

  it.each([
    [0, '0 KB'],
    [135951, '133 KB'],
    [10485760, '10 MB'],
    [20971520, '20 MB'],
    [104857600, '100 MB'],
  ])('presenta tamaño legible %s', (bytes, expected) => {
    expect(evidenceSize(bytes)).toBe(expected);
  });

  it.each([120, 120.001, Number.POSITIVE_INFINITY, 0])(
    'verifica duración real MP4 %s y libera URL',
    async (duration) => {
      const video = document.createElement('video');
      vi.spyOn(document, 'createElement').mockReturnValue(video);
      vi.spyOn(video, 'load').mockImplementation(() => undefined);
      Object.defineProperty(video, 'duration', { value: duration });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-video');
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const result = validateEvidenceFile(file('video/mp4'), policy);
      const assertion =
        duration === 120
          ? expect(result).resolves.toMatchObject({ mimeType: 'video/mp4' })
          : expect(result).rejects.toMatchObject({
              key:
                Number.isFinite(duration) && duration > 0
                  ? 'claimEvidence.errors.duration'
                  : 'claimEvidence.errors.video',
            });
      video.dispatchEvent(new Event('loadedmetadata'));
      await assertion;
      expect(revoke).toHaveBeenCalledWith('blob:test-video');
    },
  );

  it('rechaza video ilegible sin éxito de respaldo', async () => {
    const video = document.createElement('video');
    vi.spyOn(document, 'createElement').mockReturnValue(video);
    vi.spyOn(video, 'load').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-video');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const result = validateEvidenceFile(file('video/mp4'), policy);
    const assertion = expect(result).rejects.toMatchObject({ key: 'claimEvidence.errors.video' });
    video.dispatchEvent(new Event('error'));
    await assertion;
    expect(revoke).toHaveBeenCalledOnce();
  });
});

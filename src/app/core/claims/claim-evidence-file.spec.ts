import { evidenceHash, validateEvidenceFile } from './claim-evidence-file';
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

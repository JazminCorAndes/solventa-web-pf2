import {
  EvidencePolicy,
  EvidenceUploadBody,
  EvidenceValidationError,
} from './claim-evidence.models';

export async function evidenceHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateEvidenceFile(
  file: File,
  policy: EvidencePolicy,
): Promise<EvidenceUploadBody> {
  const format = policy.formatos.find((entry) => entry.mimeType === file.type);
  if (!format) throw new EvidenceValidationError('claimEvidence.errors.format');
  if (file.size <= 0 || file.size > format.maxBytes) {
    throw new EvidenceValidationError('claimEvidence.errors.size');
  }
  if (format.mimeType === 'video/mp4') {
    const duration = await videoDuration(file);
    if (duration > policy.maxVideoSeconds) {
      throw new EvidenceValidationError('claimEvidence.errors.duration');
    }
  }
  return { mimeType: format.mimeType, tamanoBytes: file.size, sha256: await evidenceHash(file) };
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const finish = (duration?: number) => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (duration !== undefined && Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new EvidenceValidationError('claimEvidence.errors.video'));
    };
    const timeout = setTimeout(() => finish(), 15_000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish();
    video.src = url;
  });
}

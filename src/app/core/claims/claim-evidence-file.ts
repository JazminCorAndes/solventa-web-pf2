import {
  EvidencePolicy,
  EvidenceMime,
  EvidenceUploadBody,
  EvidenceValidationError,
} from './claim-evidence.models';

export const EVIDENCE_FORMATS: Record<EvidenceMime, { label: string; extensions: string }> = {
  'image/jpeg': { label: 'JPG', extensions: '.jpg,.jpeg' },
  'image/png': { label: 'PNG', extensions: '.png' },
  'application/pdf': { label: 'PDF', extensions: '.pdf' },
  'video/mp4': { label: 'MP4', extensions: '.mp4' },
};

export function evidenceSize(bytes: number): string {
  if (bytes === 0) return '0 KB';
  const unit = bytes >= 1024 * 1024 ? 'MB' : 'KB';
  const value = bytes / (unit === 'MB' ? 1024 * 1024 : 1024);
  return `${Number(value.toFixed(value < 10 ? 1 : 0)) || 0.1} ${unit}`;
}

export async function evidenceHash(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateEvidenceFile(
  file: File,
  policy: EvidencePolicy,
): Promise<EvidenceUploadBody> {
  if (file.size === 0) throw new EvidenceValidationError('claimEvidence.errors.empty');
  if (policy.formatos.length === 0)
    throw new EvidenceValidationError('claimEvidence.errors.format');
  let mime = policy.formatos.find((entry) => entry.mimeType === file.type)?.mimeType;
  // Browsers may omit MIME or report legacy aliases. The server still validates the full file.
  if (
    !mime &&
    ['', 'application/octet-stream', 'image/jpg', 'image/pjpeg', 'application/x-pdf'].includes(
      file.type.toLowerCase(),
    )
  ) {
    if (file.size > Math.max(...policy.formatos.map((entry) => entry.maxBytes))) {
      throw new EvidenceValidationError('claimEvidence.errors.serverSize');
    }
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
    else if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte))
      mime = 'image/png';
    else if (String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') mime = 'application/pdf';
    else if (String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp') mime = 'video/mp4';
  }
  const format = policy.formatos.find((entry) => entry.mimeType === mime);
  if (!format) throw new EvidenceValidationError('claimEvidence.errors.format');
  if (file.size > format.maxBytes) {
    throw new EvidenceValidationError('claimEvidence.errors.size', {
      limit: evidenceSize(format.maxBytes),
    });
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

/**
 * Validation for the counter-signed PDF stored as proof of an offline signature.
 *
 * The cap is the `pyra-private` BUCKET limit (10 MiB), not the 20 MB the HR
 * upload dialog advertises — exceeding the bucket limit fails inside Supabase
 * with a generic error the user cannot act on.
 *
 * The extension is derived from the MIME map, never from the user's filename:
 * a filename is attacker-controlled and a mismatched extension is how a stored
 * file gets served as the wrong type.
 */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

/** SVG is deliberately absent — it can carry <script> (XSS). */
export const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateEvidenceFile(file: { type: string; size: number }):
  | { ok: true; ext: string }
  | { ok: false; reason: 'too_large' | 'bad_mime' } {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) return { ok: false, reason: 'bad_mime' };
  if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, ext };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // '%PDF-'

/** Content sniffing: `file.type` is client-supplied and trivially spoofed. */
export function isPdfMagic(head: Uint8Array): boolean {
  if (head.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((byte, i) => head[i] === byte);
}

/**
 * Client-side image resize + EXIF strip (Phase 15.2 Commit 1).
 *
 * Used by the lead attachments upload pipeline. Runs entirely in the
 * browser — no server-side image-processing dependency (no sharp, no
 * exifr). EXIF metadata is stripped as a side-effect of the Canvas
 * re-encode pass (Canvas does NOT preserve image metadata).
 *
 * Why client-side over server-side:
 *   - Zero new npm dependencies (sharp = ~30MB native binary)
 *   - Smaller upload bandwidth (resize BEFORE the wire)
 *   - HEIC support via createImageBitmap on iOS (Sayed's primary device)
 *   - EXIF strip free as a side effect — no privacy leak via GPS/camera
 *     metadata
 *
 * Pipeline:
 *   1. createImageBitmap(file) — decodes any browser-supported format
 *      including HEIC on iOS 13+
 *   2. Compute target dimensions (downscale only — never upscale)
 *   3. drawImage onto OffscreenCanvas (or HTMLCanvasElement fallback)
 *   4. canvas.convertToBlob / toBlob with type='image/jpeg' quality=0.82
 *   5. Wrap as a new File with `${name}.jpg` extension
 *
 * Note: HEIC inputs are silently converted to JPEG in the output Blob.
 * The original filename is preserved for display purposes ONLY — the
 * server-side storage path uses a generated nanoid + extension derived
 * from the FINAL Blob's MIME (always `.jpg` for resized output).
 */

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const OUTPUT_MIME = 'image/jpeg';

export interface ResizedImage {
  /** The resized Blob — always image/jpeg, EXIF-stripped */
  blob: Blob;
  /** Final width in pixels (downscaled if input > MAX_DIMENSION) */
  width: number;
  /** Final height in pixels */
  height: number;
}

/**
 * Resize an image File to at-most 1920×1920 (preserves aspect ratio),
 * re-encode as JPEG quality 0.82, and strip EXIF.
 *
 * Throws on:
 *   - Non-image MIME types
 *   - Browsers that can't decode the input (createImageBitmap rejects)
 *   - Canvas conversion failure (rare — usually OOM on huge images)
 */
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('الملف ليس صورة');
  }

  // createImageBitmap handles HEIC on iOS 13+ where the OS provides the
  // decoder; on desktop browsers HEIC may fail — caller surfaces the
  // error message in the toast.
  const bitmap = await createImageBitmap(file);

  // Compute downscale ratio. Never upscale — if the image is already
  // smaller than MAX_DIMENSION in both axes, we still re-encode (to
  // strip EXIF + standardize to JPEG) but keep original dimensions.
  const { width: srcW, height: srcH } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  // Prefer OffscreenCanvas where available (off-main-thread on supporting
  // browsers); fall back to HTMLCanvasElement otherwise.
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(dstW, dstH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('فشل تجهيز الصورة (OffscreenCanvas 2D)');
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close();
    blob = await canvas.convertToBlob({ type: OUTPUT_MIME, quality: JPEG_QUALITY });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('فشل تجهيز الصورة (Canvas 2D)');
    }
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    bitmap.close();
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('فشل تحويل الصورة'))),
        OUTPUT_MIME,
        JPEG_QUALITY,
      );
    });
  }

  return { blob, width: dstW, height: dstH };
}

/**
 * Wrap a resized Blob as a File. Used to maintain the File-shape contract
 * expected by FormData when submitting.
 */
export function blobToFile(blob: Blob, originalName: string): File {
  // Strip any existing extension; we always output .jpg.
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.jpg`, { type: blob.type });
}

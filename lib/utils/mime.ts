/**
 * MIME type utility — guess correct MIME type from file extension.
 *
 * Many files in storage have `application/octet-stream` because they were
 * uploaded without browser-side MIME detection. This utility resolves the
 * correct type from the file name / extension so that icons, thumbnails,
 * and previews all work correctly.
 */

const EXT_TO_MIME: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  avif: 'image/avif',
  ico: 'image/x-icon',

  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  rtf: 'application/rtf',

  // Code / markup
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  xml: 'application/xml',
  md: 'text/markdown',
  markdown: 'text/markdown',

  // Design
  ai: 'application/postscript',
  eps: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop',
  sketch: 'application/sketch',
  fig: 'application/figma',
  xd: 'application/xd',

  // Archives
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
  gz: 'application/gzip',
  tar: 'application/x-tar',

  // Fonts
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/**
 * Resolve the effective MIME type for a file.
 *
 * If the stored `storedMime` is missing, null, or the generic
 * `application/octet-stream`, falls back to a lookup based on the
 * file extension extracted from `fileName`.
 *
 * @param fileName  Original file name with extension
 * @param storedMime  MIME type from the database (may be null / octet-stream)
 * @returns A more specific MIME type, or `application/octet-stream` if truly unknown
 */
export function resolveMimeType(
  fileName: string,
  storedMime?: string | null
): string {
  // If the stored MIME is specific enough, use it
  if (
    storedMime &&
    storedMime !== 'application/octet-stream' &&
    storedMime !== 'binary/octet-stream'
  ) {
    return storedMime;
  }

  // Fall back to extension-based lookup
  const ext = getExtension(fileName);
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

/**
 * Check if a file is an image based on its name + stored MIME.
 */
export function isImageFile(
  fileName: string,
  storedMime?: string | null
): boolean {
  const mime = resolveMimeType(fileName, storedMime);
  return mime.startsWith('image/');
}

/**
 * Check if a file can be previewed inline.
 */
export function isPreviewable(
  fileName: string,
  storedMime?: string | null
): boolean {
  const mime = resolveMimeType(fileName, storedMime);
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

// ── Internal helpers ──

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
}

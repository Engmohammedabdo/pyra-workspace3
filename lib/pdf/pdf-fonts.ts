/**
 * Font loading + registration utility for jsPDF.
 * Downloads Amiri Arabic font from public/fonts/ and caches it
 * in memory for subsequent PDF generations.
 */

import type jsPDF from 'jspdf';

let fontCache: { regular: string; bold: string } | null = null;

async function fetchFontAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch font: ${url} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Register the Amiri Arabic font with a jsPDF document.
 * Fonts are downloaded on first call and cached for subsequent calls.
 *
 * After calling this, you can use:
 *   doc.setFont('Amiri', 'normal')  // Regular
 *   doc.setFont('Amiri', 'bold')    // Bold
 */
export async function registerArabicFont(
  doc: jsPDF,
  preloaded?: { regular: string; bold: string },
): Promise<void> {
  if (!fontCache) {
    if (preloaded) {
      // Server path — caller read the fonts from the filesystem (see
      // lib/pdf/pdf-assets-server.ts). Browser's relative fetch throws in Node.
      fontCache = preloaded;
    } else {
      // Guard: in Node, the relative fetch below throws ("Failed to parse URL"),
      // which would silently yield a fontless PDF (no Arabic). Fail loudly so a
      // server caller that forgot to pass `preloaded` fonts gets a clear error.
      if (typeof window === 'undefined') {
        throw new Error(
          'registerArabicFont: server-side use must pass preloaded fonts (loadServerPdfFonts) — relative fetch is browser-only',
        );
      }
      // Browser path — fetch from public/ over the origin.
      const [regular, bold] = await Promise.all([
        fetchFontAsBase64('/fonts/Amiri-Regular.ttf'),
        fetchFontAsBase64('/fonts/Amiri-Bold.ttf'),
      ]);
      fontCache = { regular, bold };
    }
  }

  doc.addFileToVFS('Amiri-Regular.ttf', fontCache.regular);
  doc.addFileToVFS('Amiri-Bold.ttf', fontCache.bold);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
}

/**
 * Load an image from URL, RESIZE it to a max width for PDF embedding,
 * and return as base64 data URI for jsPDF addImage().
 *
 * Why resize? jsPDF decompresses PNG to raw RGBA bitmap when embedding.
 * A 4000x2250 logo = 34MB in the PDF, but it's displayed at ~40mm wide
 * which only needs ~500px at 300 DPI. Resizing to 500px max width reduces
 * the PDF from 34MB to ~400KB.
 *
 * Returns null if the image can't be loaded (graceful fallback to text branding).
 */
const imageCache: Record<string, string> = {};

/** Max width in pixels for images embedded in PDFs (300 DPI at ~45mm) */
const MAX_IMAGE_WIDTH = 500;

export async function loadImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (imageCache[url]) return imageCache[url];

  try {
    // In browser: use canvas to resize
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return await loadAndResizeInBrowser(url);
    }

    // Server-side: fetch raw and hope it's reasonable size
    // (server-side PDF generation should pre-resize images)
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const base64 = btoa(binary);
    const dataUri = `data:${contentType};base64,${base64}`;
    imageCache[url] = dataUri;
    return dataUri;
  } catch {
    return null;
  }
}

/**
 * Load image in browser, resize via canvas, return as compressed JPEG data URI.
 * This is the key optimization — shrinks a 4000x2250 PNG (34MB uncompressed)
 * to a 500px-wide JPEG (~30KB).
 */
async function loadAndResizeInBrowser(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      // Only resize if larger than max
      if (width > MAX_IMAGE_WIDTH) {
        const ratio = MAX_IMAGE_WIDTH / width;
        width = MAX_IMAGE_WIDTH;
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }

      // White background (for transparent PNGs)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Output as JPEG (much smaller than PNG for photos/logos)
      const dataUri = canvas.toDataURL('image/jpeg', 0.85);
      imageCache[url] = dataUri;
      resolve(dataUri);
    };

    img.onerror = () => resolve(null);
    img.src = url;
  });
}

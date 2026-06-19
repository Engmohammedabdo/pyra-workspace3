import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Server-only PDF asset loader (fonts + default logo).
 *
 * ⚠️ SERVER-ONLY — import this from route handlers / server code ONLY. It uses
 * `node:fs`, so importing it into a client-bundled module would break the client
 * build. (Kept out of the client bundle by the import graph: only the quote-send
 * + WhatsApp send-pdf route handlers import it.)
 *
 * WHY THIS EXISTS: `lib/pdf/pdf-fonts.ts` is imported by client components
 * (QuoteBuilder, quotes-client) so it CANNOT import `node:fs`. But server-side
 * PDF generation (quote-send email, WhatsApp send-pdf) needs the Amiri fonts +
 * logo, and `fetch('/fonts/..')` with a RELATIVE url throws in Node ("Failed to
 * parse URL"). So the server reads the assets from the filesystem HERE and
 * INJECTS them into generateQuotePDF/generateInvoicePDF via options.
 *
 * Browser PDF download is unaffected: those callers pass no fonts/logo, so the
 * generators fall back to the existing `fetch` path.
 */

let _fontCache: { regular: string; bold: string } | null = null;
let _logoCache: string | null = null;

/** Amiri Regular + Bold as base64 (cached for the process lifetime). */
export async function loadServerPdfFonts(): Promise<{ regular: string; bold: string }> {
  if (_fontCache) return _fontCache;
  const dir = join(process.cwd(), 'public', 'fonts');
  const [regular, bold] = await Promise.all([
    readFile(join(dir, 'Amiri-Regular.ttf')),
    readFile(join(dir, 'Amiri-Bold.ttf')),
  ]);
  _fontCache = { regular: regular.toString('base64'), bold: bold.toString('base64') };
  return _fontCache;
}

/**
 * Default Pyramedia logo as a `data:image/png;base64,...` URI (cached), or null
 * if the file is missing. The asset is 904×398 (~1.4 MB raw in the PDF) — small
 * enough to embed without resizing (well under Gmail's 25 MB attachment cap).
 */
export async function loadServerDefaultLogo(): Promise<string | null> {
  if (_logoCache) return _logoCache;
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'images', 'pyramediax-logo.png'));
    _logoCache = `data:image/png;base64,${buf.toString('base64')}`;
    return _logoCache;
  } catch {
    return null;
  }
}

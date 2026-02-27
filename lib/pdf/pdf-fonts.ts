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
export async function registerArabicFont(doc: jsPDF): Promise<void> {
  if (!fontCache) {
    const [regular, bold] = await Promise.all([
      fetchFontAsBase64('/fonts/Amiri-Regular.ttf'),
      fetchFontAsBase64('/fonts/Amiri-Bold.ttf'),
    ]);
    fontCache = { regular, bold };
  }

  doc.addFileToVFS('Amiri-Regular.ttf', fontCache.regular);
  doc.addFileToVFS('Amiri-Bold.ttf', fontCache.bold);
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
  doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
}

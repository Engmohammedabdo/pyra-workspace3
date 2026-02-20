'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

/**
 * PdfThumbnail – renders the first page of a PDF into a <canvas>.
 *
 * Uses pdfjs-dist (already installed & configured in next.config.ts).
 * Lazy-loads the PDF only when the component mounts. Falls back to a
 * styled icon if rendering fails.
 */

interface PdfThumbnailProps {
  /** Portal API URL to the inline view, e.g. `/api/portal/files/{id}/view` */
  url: string;
  /** File name for alt/fallback display */
  fileName: string;
  /** CSS class for the outer container */
  className?: string;
}

export function PdfThumbnail({ url, fileName, className }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if same URL is already rendered
    if (currentUrlRef.current === url) return;
    currentUrlRef.current = url;
    setState('loading');

    let cancelled = false;

    async function renderPdf() {
      try {
        const pdfjsLib = await import('pdfjs-dist');

        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        }

        const loadingTask = pdfjsLib.getDocument({
          url,
          disableAutoFetch: true,
          disableStream: true,
        });

        const pdf = await loadingTask.promise;
        if (cancelled) { await pdf.destroy(); return; }

        const page = await pdf.getPage(1);
        if (cancelled) { page.cleanup(); await pdf.destroy(); return; }

        const canvas = canvasRef.current;
        if (!canvas) { page.cleanup(); await pdf.destroy(); return; }

        const desiredWidth = 400;
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { page.cleanup(); await pdf.destroy(); return; }

        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;

        if (!cancelled) {
          setState('ready');
        }

        page.cleanup();
        await pdf.destroy();
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('PdfThumbnail render failed:', err);
        }
        if (!cancelled) setState('error');
      }
    }

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state === 'error') {
    return (
      <div className={`flex items-center justify-center bg-red-50 ${className || ''}`}>
        <FileText className="h-12 w-12 text-red-400 opacity-80" />
      </div>
    );
  }

  return (
    <div className={`relative ${className || ''}`}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50/60 z-10">
          <Loader2 className="h-6 w-6 text-red-400 animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
        style={{ display: 'block', opacity: state === 'ready' ? 1 : 0.3 }}
        title={fileName}
      />
    </div>
  );
}

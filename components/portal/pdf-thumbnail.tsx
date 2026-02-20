'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';

/**
 * PdfThumbnail – renders the first page of a PDF into a <canvas>.
 *
 * Uses pdfjs-dist (already installed & configured in next.config.ts).
 * Lazy-loads the PDF only when the component mounts (IntersectionObserver
 * can be added by the parent if needed). Falls back to a styled icon
 * if rendering fails.
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
  const renderingRef = useRef(false);

  useEffect(() => {
    if (renderingRef.current) return;
    renderingRef.current = true;

    let cancelled = false;

    async function renderPdf() {
      try {
        // Dynamically import pdfjs-dist (client-only, tree-shaken)
        const pdfjsLib = await import('pdfjs-dist');

        // Set worker path (pdfjs-dist v5 ships the worker in build/)
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        }

        const loadingTask = pdfjsLib.getDocument({
          url,
          // Only load first page for performance
          disableAutoFetch: true,
          disableStream: true,
        });

        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Render at a reasonable resolution for thumbnails
        const desiredWidth = 400; // px
        const viewport = page.getViewport({ scale: 1 });
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;

        if (!cancelled) {
          setState('ready');
        }

        // Clean up
        page.cleanup();
        await pdf.destroy();
      } catch (err) {
        console.warn('PdfThumbnail render failed:', err);
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
        style={{ display: state === 'ready' ? 'block' : 'block', opacity: state === 'ready' ? 1 : 0.3 }}
        title={fileName}
      />
    </div>
  );
}

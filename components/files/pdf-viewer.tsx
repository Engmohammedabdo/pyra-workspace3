'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): void;
}

interface PDFPageProxy {
  getViewport(params: { scale: number; rotation: number }): PDFPageViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PDFPageViewport;
  }): { promise: Promise<void> };
}

interface PDFPageViewport {
  width: number;
  height: number;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface PdfViewerProps {
  url: string;
  compact?: boolean;
}

export function PdfViewer({ url, compact = false }: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ promise: Promise<void> } | null>(null);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);

        // Dynamic import for client-side only
        const pdfjsLib = await import('pdfjs-dist');

        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/cmaps/',
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;

        if (cancelled) {
          doc.destroy();
          return;
        }

        setPdfDoc(doc as unknown as PDFDocumentProxy);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError('فشل في تحميل ملف PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || rendering) return;

    try {
      setRendering(true);
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale: zoom * 2, rotation });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / 2}px`;
      canvas.style.height = `${viewport.height / 2}px`;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });

      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch {
      // Render cancelled — ignore
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, currentPage, zoom, rotation, rendering]);

  useEffect(() => {
    renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, currentPage, zoom, rotation]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom handlers
  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
    const nextIdx = Math.min(idx + 1, ZOOM_LEVELS.length - 1);
    setZoom(ZOOM_LEVELS[nextIdx]);
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.findIndex((z) => z >= zoom);
    const prevIdx = Math.max(idx - 1, 0);
    setZoom(ZOOM_LEVELS[prevIdx]);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  // Page navigation
  const goNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 1));

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goNext(); // RTL
      if (e.key === 'ArrowRight') goPrev(); // RTL
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages, zoom]);

  // =================== LOADING STATE ===================
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">جاري تحميل PDF...</p>
          <p className="text-xs text-muted-foreground mt-1">يرجى الانتظار</p>
        </div>
      </div>
    );
  }

  // =================== ERROR STATE ===================
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <span className="text-3xl">📄</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">تأكد من صلاحية الملف وحاول مرة أخرى</p>
        </div>
      </div>
    );
  }

  // =================== PDF VIEWER ===================
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className={`flex items-center justify-between border-b bg-muted/30 backdrop-blur-sm ${compact ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goPrev}
            disabled={currentPage <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-medium min-w-[80px] justify-center">
            <input
              type="number"
              value={currentPage}
              onChange={(e) => {
                const p = parseInt(e.target.value);
                if (p >= 1 && p <= totalPages) setCurrentPage(p);
              }}
              min={1}
              max={totalPages}
              className="w-10 h-6 rounded bg-background border text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-muted-foreground">/ {totalPages}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goNext}
            disabled={currentPage >= totalPages}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom + Rotate controls */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} disabled={zoom <= ZOOM_LEVELS[0]}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-mono min-w-[40px] text-center text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRotate}>
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/20 flex justify-center p-4"
        style={{ minHeight: compact ? '350px' : '500px' }}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="shadow-2xl rounded-sm bg-white dark:bg-gray-100"
          />
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-[2px] rounded-sm">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          )}
        </div>
      </div>

      {/* Page thumbnails strip */}
      {totalPages > 1 && !compact && (
        <ThumbnailStrip
          pdfDoc={pdfDoc!}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageSelect={setCurrentPage}
        />
      )}
    </div>
  );
}

// =================== THUMBNAIL STRIP ===================
function ThumbnailStrip({
  pdfDoc,
  currentPage,
  totalPages,
  onPageSelect,
}: {
  pdfDoc: PDFDocumentProxy;
  currentPage: number;
  totalPages: number;
  onPageSelect: (page: number) => void;
}) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate thumbnails for first N pages
  useEffect(() => {
    const maxThumbs = Math.min(totalPages, 20);
    const urls: string[] = [];

    async function generateThumbnails() {
      for (let i = 1; i <= maxThumbs; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 0.3, rotation: 0 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport }).promise;
          urls.push(canvas.toDataURL('image/jpeg', 0.5));
        } catch {
          urls.push('');
        }
      }
      setThumbnails(urls);
    }

    generateThumbnails();
  }, [pdfDoc, totalPages]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (containerRef.current) {
      const activeThumb = containerRef.current.querySelector(`[data-page="${currentPage}"]`);
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentPage]);

  if (thumbnails.length === 0) return null;

  return (
    <div className="border-t bg-muted/20 p-2">
      <div
        ref={containerRef}
        className="flex gap-2 overflow-x-auto py-1 px-1 scrollbar-thin"
      >
        {thumbnails.map((src, idx) => {
          const pageNum = idx + 1;
          const isActive = pageNum === currentPage;
          return (
            <button
              key={pageNum}
              data-page={pageNum}
              onClick={() => onPageSelect(pageNum)}
              className={`relative shrink-0 rounded-md overflow-hidden border-2 transition-all duration-200 hover:scale-105 ${
                isActive
                  ? 'border-orange-500 shadow-lg shadow-orange-500/20 ring-2 ring-orange-500/30'
                  : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={`Page ${pageNum}`}
                  className="w-12 h-16 object-cover bg-white"
                />
              ) : (
                <div className="w-12 h-16 bg-muted flex items-center justify-center">
                  <span className="text-[8px] text-muted-foreground">{pageNum}</span>
                </div>
              )}
              <span
                className={`absolute bottom-0 inset-x-0 text-[8px] text-center py-0.5 ${
                  isActive
                    ? 'bg-orange-500 text-white font-bold'
                    : 'bg-black/50 text-white'
                }`}
              >
                {pageNum}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

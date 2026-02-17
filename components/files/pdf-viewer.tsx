'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Columns2,
  AlignJustify,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ---------------------------------------------------------------
   Types for PDF.js (v5)
--------------------------------------------------------------- */
interface PDFDocumentProxy {
  numPages: number;
  getPage(num: number): Promise<PDFPageProxy>;
  destroy(): void;
}
interface PDFPageProxy {
  getViewport(p: { scale: number; rotation: number }): PDFPageViewport;
  render(p: { canvasContext: CanvasRenderingContext2D; viewport: PDFPageViewport }): { promise: Promise<void> };
  cleanup(): void;
}
interface PDFPageViewport {
  width: number;
  height: number;
}

/* ---------------------------------------------------------------
   Zoom presets
--------------------------------------------------------------- */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/* ---------------------------------------------------------------
   Component
--------------------------------------------------------------- */
interface Props {
  url: string;
}

export function PdfViewer({ url }: Props) {
  /* State */
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'> ('fit');      // 'fit' = fit-to-width
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  /* Refs */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef(0);   // to cancel stale renders

  /* ====================== LOAD PDF ====================== */
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl:            '/pdf-assets/cmaps/',
          cMapPacked:         true,
          standardFontDataUrl: '/pdf-assets/fonts/',
          enableXfa:          true,
          useSystemFonts:     true,
          disableFontFace:    false,
        });

        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          if (p.total > 0) setProgress(Math.min(99, Math.round((p.loaded / p.total) * 100)));
        };

        doc = (await loadingTask.promise) as unknown as PDFDocumentProxy;

        if (cancelled) { doc.destroy(); return; }

        setPdf(doc);
        setTotal(doc.numPages);
        setPage(1);
        setProgress(100);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('PDF load error:', err);
          setError('فشل في تحميل ملف PDF');
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (doc) doc.destroy();
    };
  }, [url]);

  /* ====================== RENDER PAGE ====================== */
  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;

    const renderId = ++renderIdRef.current;
    setRendering(true);

    try {
      const pg = await pdf.getPage(page);

      // Calculate scale: fit-to-width or explicit zoom
      const containerWidth = containerRef.current.clientWidth - 48; // 24px padding each side
      const baseViewport = pg.getViewport({ scale: 1, rotation });
      const fitScale = containerWidth / baseViewport.width;
      const actualZoom = zoom === 'fit' ? fitScale : zoom;

      // Render at 2× for retina sharpness
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pg.getViewport({ scale: actualZoom * dpr, rotation });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width  = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      // Cancel guard
      if (renderId !== renderIdRef.current) return;

      await pg.render({ canvasContext: ctx, viewport }).promise;

      pg.cleanup();   // release page resources
    } catch {
      // render was cancelled or failed — ignore
    } finally {
      if (renderId === renderIdRef.current) setRendering(false);
    }
  }, [pdf, page, zoom, rotation]);

  useEffect(() => { renderPage(); }, [renderPage]);

  /* Recalculate fit-to-width on window resize */
  useEffect(() => {
    if (zoom !== 'fit') return;
    const onResize = () => renderPage();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [zoom, renderPage]);

  /* ====================== CONTROLS ====================== */
  const numericZoom = useMemo(() => {
    if (zoom !== 'fit' ) return zoom;
    if (!containerRef.current || !pdf) return 1;
    return 1; // placeholder — actual fit is done in renderPage
  }, [zoom, pdf]);

  const zoomIn = () => {
    if (zoom === 'fit') {
      // switch from fit to first step above 1
      setZoom(1.25);
    } else {
      const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
      setZoom(ZOOM_STEPS[Math.min(idx + 1, ZOOM_STEPS.length - 1)]);
    }
  };
  const zoomOut = () => {
    if (zoom === 'fit') {
      setZoom(0.75);
    } else {
      const idx = ZOOM_STEPS.findIndex(z => z >= zoom);
      setZoom(ZOOM_STEPS[Math.max(idx - 1, 0)]);
    }
  };
  const fitWidth = () => setZoom('fit');
  const rotate = () => setRotation(r => (r + 90) % 360);
  const goNext = () => setPage(p => Math.min(p + 1, total));
  const goPrev = () => setPage(p => Math.max(p - 1, 1));

  /* Keyboard shortcuts */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowLeft':  goNext(); break;   // RTL
        case 'ArrowRight': goPrev(); break;   // RTL
        case '+': case '=': zoomIn();  break;
        case '-':           zoomOut(); break;
        case '0':           fitWidth(); break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, zoom]);

  /* ====================== LOADING ====================== */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Loader2 className="h-9 w-9 text-white animate-spin" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold">جاري تحميل PDF...</p>
          {/* Progress bar */}
          <div className="w-56 h-1.5 bg-muted rounded-full overflow-hidden mx-auto">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress > 0 ? `${progress}%` : 'يرجى الانتظار...'}
          </p>
        </div>
      </div>
    );
  }

  /* ====================== ERROR ====================== */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <span className="text-3xl">📄</span>
        </div>
        <p className="text-sm font-medium text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground">تأكد من صلاحية الملف وحاول مرة أخرى</p>
      </div>
    );
  }

  /* ====================== VIEWER ====================== */
  return (
    <div className="flex flex-col h-full">
      {/* ─── Toolbar ─── */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 backdrop-blur-sm shrink-0 gap-2 flex-wrap">
        {/* Page nav */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={page <= 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1 text-xs font-medium">
            <input
              type="number"
              value={page}
              onChange={e => {
                const v = parseInt(e.target.value);
                if (v >= 1 && v <= total) setPage(v);
              }}
              min={1}
              max={total}
              className="w-11 h-6 rounded border bg-background text-center text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-muted-foreground">/ {total}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={page >= total}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom + Rotate */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>

          <button
            onClick={fitWidth}
            className={`text-xs font-mono min-w-[52px] text-center rounded px-1.5 py-0.5 transition-colors ${
              zoom === 'fit' ? 'bg-orange-500/10 text-orange-600 font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {zoom === 'fit' ? 'ملائم' : `${Math.round((zoom as number) * 100)}%`}
          </button>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${zoom === 'fit' ? 'text-orange-500' : ''}`}
            onClick={fitWidth}
            title="ملائم العرض"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={rotate} title="تدوير">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ─── Canvas area ─── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center bg-muted/20 p-6"
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="shadow-2xl bg-white dark:bg-gray-50 rounded-sm"
          />
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-gray-50/40 backdrop-blur-[1px] rounded-sm">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Thumbnail strip ─── */}
      {total > 1 && (
        <ThumbnailStrip
          pdf={pdf!}
          currentPage={page}
          totalPages={total}
          onSelect={setPage}
        />
      )}
    </div>
  );
}

/* ===============================================================
   Thumbnail Strip
=============================================================== */
function ThumbnailStrip({
  pdf,
  currentPage,
  totalPages,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  currentPage: number;
  totalPages: number;
  onSelect: (p: number) => void;
}) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  /* Generate lazily (first 30 pages max) */
  useEffect(() => {
    let cancelled = false;
    const max = Math.min(totalPages, 30);
    const urls: string[] = new Array(max).fill('');

    (async () => {
      for (let i = 1; i <= max; i++) {
        if (cancelled) break;
        try {
          const pg = await pdf.getPage(i);
          const vp = pg.getViewport({ scale: 0.25, rotation: 0 });
          const c  = document.createElement('canvas');
          c.width  = vp.width;
          c.height = vp.height;
          const ctx = c.getContext('2d')!;
          await pg.render({ canvasContext: ctx, viewport: vp }).promise;
          urls[i - 1] = c.toDataURL('image/jpeg', 0.4);
          pg.cleanup();
          // batch-update every 5 pages
          if (i % 5 === 0 || i === max) setThumbs([...urls]);
        } catch { /* skip */ }
      }
    })();

    return () => { cancelled = true; };
  }, [pdf, totalPages]);

  /* scroll active into view */
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-p="${currentPage}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentPage]);

  if (thumbs.length === 0) return null;

  return (
    <div className="border-t bg-muted/20 p-2 shrink-0">
      <div ref={ref} className="flex gap-2 overflow-x-auto py-1 px-1">
        {thumbs.map((src, idx) => {
          const n = idx + 1;
          const active = n === currentPage;
          return (
            <button
              key={n}
              data-p={n}
              onClick={() => onSelect(n)}
              className={`relative shrink-0 rounded overflow-hidden border-2 transition-all duration-150 hover:scale-105 ${
                active
                  ? 'border-orange-500 shadow-lg shadow-orange-500/20 ring-2 ring-orange-500/30'
                  : 'border-transparent hover:border-muted-foreground/30'
              }`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={`${n}`} className="w-12 h-16 object-cover bg-white" />
              ) : (
                <div className="w-12 h-16 bg-muted flex items-center justify-center">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              )}
              <span
                className={`absolute bottom-0 inset-x-0 text-[8px] text-center py-0.5 ${
                  active ? 'bg-orange-500 text-white font-bold' : 'bg-black/50 text-white'
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

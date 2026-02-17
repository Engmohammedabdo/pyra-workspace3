'use client';

import { useState } from 'react';
import { Loader2, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ---------------------------------------------------------------
   Native Browser PDF Viewer

   Uses the browser's built-in PDF renderer via <iframe>.
   This approach correctly renders Arabic text with proper
   ligatures, unlike PDF.js canvas which breaks Arabic shaping.

   The proxy URL (/api/files/download/...) returns the PDF with
   X-Frame-Options: SAMEORIGIN, allowing same-origin embedding.
--------------------------------------------------------------- */

interface Props {
  url: string;
}

export function PdfViewer({ url }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Build the inline URL (no ?download=true so it serves inline)
  const iframeUrl = url;

  return (
    <div className="flex flex-col h-full">
      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold">جاري تحميل PDF...</p>
            <p className="text-xs text-muted-foreground">يرجى الانتظار</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">تعذّر عرض PDF في المتصفح</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              يمكنك تحميل الملف أو فتحه في نافذة جديدة
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const a = document.createElement('a');
                a.href = url + (url.includes('?') ? '&' : '?') + 'download=true';
                a.download = '';
                a.click();
              }}
            >
              <Download className="h-4 w-4" />
              تحميل
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.open(url, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              فتح في نافذة جديدة
            </Button>
          </div>
        </div>
      )}

      {/* Native PDF viewer via iframe */}
      {!error && (
        <iframe
          src={iframeUrl}
          className="flex-1 w-full h-full min-h-[600px] border-0 bg-white dark:bg-gray-100 rounded-sm"
          title="PDF Viewer"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          // Allow the iframe to use full screen and navigate within itself
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          style={{ colorScheme: 'light' }}
        />
      )}
    </div>
  );
}

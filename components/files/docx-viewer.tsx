'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, FileWarning } from 'lucide-react';

interface DocxViewerProps {
  url: string;
}

export function DocxViewer({ url }: DocxViewerProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function convert() {
      try {
        // Dynamically import mammoth (large library, no SSR)
        const mammoth = await import('mammoth');

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch file');

        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
          }
        );

        if (!cancelled) {
          setHtml(result.value);
          setLoading(false);
        }
      } catch (err) {
        console.error('DOCX preview error:', err);
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    convert();
    return () => { cancelled = true; };
  }, [url]);

  // Detect direction from HTML content
  const direction = useMemo(() => {
    if (!html) return 'ltr';
    const rtlChars = (html.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
    const latinChars = (html.match(/[a-zA-Z]/g) || []).length;
    return rtlChars > latinChars ? 'rtl' : 'ltr';
  }, [html]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">جاري تحويل ملف Word...</p>
      </div>
    );
  }

  if (error || !html) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <FileWarning className="h-8 w-8 mb-3 opacity-50" />
        <p className="text-sm">فشل في معاينة ملف Word</p>
        <p className="text-xs mt-1">حاول تحميل الملف لعرضه محلياً</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border bg-card overflow-auto max-h-[60vh] p-6"
      dir={direction}
    >
      <article
        className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:leading-relaxed prose-a:text-primary prose-table:text-sm prose-th:bg-muted/50 prose-td:border prose-th:border prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

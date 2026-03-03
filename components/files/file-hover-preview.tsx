'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { FileIcon } from './file-icon';
import { formatFileSize } from '@/lib/utils/format';
import { useFileUrl } from '@/hooks/useFiles';
import type { FileListItem } from '@/types/database';

const HOVER_DELAY = 500;

interface FileHoverPreviewProps {
  file: FileListItem;
  children: React.ReactNode;
}

function isImage(mime: string) {
  return mime.startsWith('image/');
}

export function FileHoverPreview({ file, children }: FileHoverPreviewProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const getUrl = useFileUrl();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (file.isFolder) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPosition({ x: rect.left + rect.width / 2, y: rect.top });

      clearTimer();
      timerRef.current = setTimeout(() => {
        setShow(true);

        // Fetch thumbnail for images
        if (isImage(file.mimeType) && !thumbUrl) {
          setThumbLoading(true);
          getUrl
            .mutateAsync({ path: file.path })
            .then((url) => {
              setThumbUrl(url);
              setThumbLoading(false);
            })
            .catch(() => setThumbLoading(false));
        }
      }, HOVER_DELAY);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file.isFolder, file.mimeType, file.path, thumbUrl, clearTimer]
  );

  const handleMouseLeave = useCallback(() => {
    clearTimer();
    setShow(false);
  }, [clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  if (file.isFolder) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
    >
      {children}

      {show && position && (
        <div
          className="fixed z-[60] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.min(position.x, window.innerWidth - 220),
            top: Math.max(position.y - 8, 8),
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-popover border rounded-xl shadow-xl overflow-hidden w-[200px]">
            {isImage(file.mimeType) ? (
              <div className="aspect-square bg-muted/50 flex items-center justify-center">
                {thumbLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : thumbUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={thumbUrl}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <FileIcon mimeType={file.mimeType} isFolder={false} size={32} />
                )}
              </div>
            ) : (
              <div className="p-4 flex items-center justify-center">
                <FileIcon mimeType={file.mimeType} isFolder={false} size={40} />
              </div>
            )}
            <div className="px-3 py-2 border-t bg-muted/30">
              <p className="text-xs font-medium truncate">
                {decodeURIComponent(file.name)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatFileSize(file.size)}
                {file.mimeType && ` · ${file.mimeType.split('/')[1]?.toUpperCase() || file.mimeType}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

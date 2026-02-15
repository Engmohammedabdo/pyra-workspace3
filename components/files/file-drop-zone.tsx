'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FileDropZoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function FileDropZone({ onDrop, disabled, children }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounter.current += 1;
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      e.dataTransfer.dropEffect = 'copy';
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [disabled, onDrop]
  );

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm border-2 border-dashed border-pyra-orange rounded-lg">
          <div className="flex flex-col items-center gap-3 text-pyra-orange">
            <div className="w-16 h-16 rounded-full bg-pyra-orange/10 flex items-center justify-center animate-bounce">
              <Upload className="h-8 w-8" />
            </div>
            <p className="text-lg font-semibold">أفلت الملفات هنا للرفع</p>
            <p className="text-sm text-muted-foreground">يمكنك رفع عدة ملفات في نفس الوقت</p>
          </div>
        </div>
      )}
    </div>
  );
}

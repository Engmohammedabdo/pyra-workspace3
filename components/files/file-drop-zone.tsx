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

      // Ignore internal drag operations (file moving within explorer)
      if (e.dataTransfer.types.includes('application/x-pyra-file-path')) return;

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
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      if (disabled) return;

      // Ignore internal drag operations (file moving within explorer)
      if (e.dataTransfer.types.includes('application/x-pyra-file-path')) return;

      // Try to read entries for folder support
      const items = e.dataTransfer.items;
      const hasEntries = items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function';

      if (hasEntries) {
        const allFiles: File[] = [];
        const entries: FileSystemEntry[] = [];

        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) entries.push(entry);
        }

        // Recursively read all files from directory entries
        const readEntry = async (entry: FileSystemEntry, path: string): Promise<void> => {
          if (entry.isFile) {
            const fileEntry = entry as FileSystemFileEntry;
            const file = await new Promise<File>((resolve, reject) => {
              fileEntry.file(resolve, reject);
            });
            // Create a new File with the relative path preserved
            const fileWithPath = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
            Object.defineProperty(fileWithPath, 'webkitRelativePath', { value: path + file.name, writable: false });
            allFiles.push(fileWithPath);
          } else if (entry.isDirectory) {
            const dirEntry = entry as FileSystemDirectoryEntry;
            const reader = dirEntry.createReader();
            const childEntries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
              const all: FileSystemEntry[] = [];
              const readBatch = () => {
                reader.readEntries((results) => {
                  if (results.length === 0) {
                    resolve(all);
                  } else {
                    all.push(...results);
                    readBatch();
                  }
                }, reject);
              };
              readBatch();
            });
            for (const child of childEntries) {
              await readEntry(child, path + entry.name + '/');
            }
          }
        };

        for (const entry of entries) {
          await readEntry(entry, '');
        }

        if (allFiles.length > 0) {
          onDrop(allFiles);
        }
      } else {
        // Fallback: plain file drop
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          onDrop(files);
        }
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

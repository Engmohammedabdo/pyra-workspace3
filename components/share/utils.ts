'use client';

import { File, Image, Film, Music, Archive, FileText } from 'lucide-react';

export const formatBytes = (bytes: number | null): string => {
  if (bytes == null || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const getFileIcon = (mime: string | null) => {
  if (!mime) return File({ className: "h-12 w-12" });
  if (mime.startsWith('image/')) return Image({ className: "h-12 w-12" });
  if (mime.startsWith('video/')) return Film({ className: "h-12 w-12" });
  if (mime.startsWith('audio/')) return Music({ className: "h-12 w-12" });
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text')) return FileText({ className: "h-12 w-12" });
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z')) return Archive({ className: "h-12 w-12" });
  return File({ className: "h-12 w-12" });
};

export const getFileExtension = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : '';
};

export const relativeTime = (dateStr: string): string => {
  const diff = new Date(dateStr).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const isFuture = diff > 0;
  if (absDiff < 60_000) return 'الآن';
  if (absDiff < 3_600_000) { const m = Math.floor(absDiff / 60_000); return isFuture ? `بعد ${m} دقيقة` : `منذ ${m} دقيقة`; }
  if (absDiff < 86_400_000) { const h = Math.floor(absDiff / 3_600_000); return isFuture ? `بعد ${h} ساعة` : `منذ ${h} ساعة`; }
  const d = Math.floor(absDiff / 86_400_000); return isFuture ? `بعد ${d} يوم` : `منذ ${d} يوم`;
};

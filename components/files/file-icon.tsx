'use client';

import {
  Folder,
  FileText,
  Image,
  Film,
  Music,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  Presentation,
  File,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const ICON_MAP: Record<string, React.ElementType> = {
  folder: Folder,
  // Images
  'image/jpeg': Image,
  'image/png': Image,
  'image/gif': Image,
  'image/webp': Image,
  'image/svg+xml': Image,
  'image/bmp': Image,
  'image/tiff': Image,
  // Video
  'video/mp4': Film,
  'video/webm': Film,
  'video/avi': Film,
  'video/quicktime': Film,
  'video/x-msvideo': Film,
  // Audio
  'audio/mpeg': Music,
  'audio/wav': Music,
  'audio/ogg': Music,
  'audio/mp3': Music,
  // Archives
  'application/zip': FileArchive,
  'application/x-rar': FileArchive,
  'application/x-7z-compressed': FileArchive,
  'application/gzip': FileArchive,
  'application/x-tar': FileArchive,
  // Documents
  'application/pdf': FileText,
  'application/msword': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  // Spreadsheets
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  // Presentations
  'application/vnd.ms-powerpoint': Presentation,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': Presentation,
  // Code
  'text/html': FileCode,
  'text/css': FileCode,
  'text/javascript': FileCode,
  'application/javascript': FileCode,
  'application/json': FileCode,
  'text/xml': FileCode,
  'application/xml': FileCode,
  'text/plain': FileText,
};

const COLOR_MAP: Record<string, string> = {
  folder: 'text-pyra-orange',
  image: 'text-emerald-500',
  video: 'text-purple-500',
  audio: 'text-pink-500',
  archive: 'text-amber-600',
  document: 'text-blue-500',
  spreadsheet: 'text-green-600',
  presentation: 'text-red-500',
  code: 'text-cyan-500',
  default: 'text-muted-foreground',
};

function getColorCategory(mimeType: string): string {
  if (mimeType === 'folder') return 'folder';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z') || mimeType.includes('tar') || mimeType.includes('gzip')) return 'archive';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
  if (mimeType.includes('word') || mimeType === 'application/pdf' || mimeType === 'text/plain') return 'document';
  if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css') || mimeType.includes('xml')) return 'code';
  return 'default';
}

interface FileIconProps {
  mimeType: string;
  isFolder: boolean;
  className?: string;
  size?: number;
}

export function FileIcon({ mimeType, isFolder, className, size = 20 }: FileIconProps) {
  const type = isFolder ? 'folder' : mimeType;
  const IconComponent = ICON_MAP[type] || File;
  const colorCategory = getColorCategory(type);
  const colorClass = COLOR_MAP[colorCategory] || COLOR_MAP.default;

  return (
    <IconComponent
      size={size}
      className={cn(colorClass, className)}
    />
  );
}

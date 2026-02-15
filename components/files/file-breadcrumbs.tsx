'use client';

import { ChevronLeft, Home } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface FileBreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function FileBreadcrumbs({ path, onNavigate }: FileBreadcrumbsProps) {
  const parts = path.split('/').filter(Boolean);

  return (
    <nav className="flex items-center gap-1.5 text-sm overflow-x-auto scrollbar-none">
      <button
        onClick={() => onNavigate('')}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0',
          'hover:bg-accent hover:text-accent-foreground',
          parts.length === 0
            ? 'text-foreground font-medium'
            : 'text-muted-foreground'
        )}
      >
        <Home size={16} />
        <span>الملفات</span>
      </button>

      {parts.map((part, index) => {
        const currentPath = parts.slice(0, index + 1).join('/');
        const isLast = index === parts.length - 1;

        return (
          <div key={currentPath} className="flex items-center gap-1.5 shrink-0">
            <ChevronLeft size={14} className="text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
            <button
              onClick={() => !isLast && onNavigate(currentPath)}
              className={cn(
                'px-2 py-1 rounded-md transition-colors max-w-[200px] truncate',
                isLast
                  ? 'text-foreground font-medium cursor-default'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              disabled={isLast}
            >
              {decodeURIComponent(part)}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

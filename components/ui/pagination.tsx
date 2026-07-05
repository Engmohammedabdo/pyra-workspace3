'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  const t = useTranslations('common.pagination');
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      {/* In RTL: first button renders on RIGHT = "previous" (backward) */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={t('prev')}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground px-3 select-none">
        {t('pageOf', { page, totalPages })}
      </span>
      {/* In RTL: last button renders on LEFT = "next" (forward) */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label={t('next')}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

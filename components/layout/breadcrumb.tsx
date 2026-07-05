'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useBreadcrumbExtra } from './breadcrumb-context';
import { Button } from '@/components/ui/button';

export function Breadcrumb() {
  const t = useTranslations('nav.segments');
  const tb = useTranslations('nav.breadcrumb');
  const pathname = usePathname();
  const router = useRouter();
  const { extra } = useBreadcrumbExtra();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const lastSegment = segments[segments.length - 1];
  const lastSegmentKey = lastSegment as Parameters<typeof t>[0];
  const lastLabel = t.has(lastSegmentKey) ? t(lastSegmentKey) : decodeURIComponent(lastSegment);

  return (
    <nav aria-label={tb('navAria')} className="flex items-center gap-1 text-sm text-muted-foreground">
      {/* Back button for deep pages */}
      {segments.length > 2 && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 me-1 shrink-0"
          onClick={() => router.back()}
          aria-label={tb('back')}
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
        </Button>
      )}

      {/* Mobile: only show current page name */}
      <span className="sm:hidden font-medium text-foreground flex items-center gap-1.5">
        {lastLabel}
        {extra.resultCount !== undefined && extra.resultCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground min-w-[20px]">
            {extra.resultCount}
          </span>
        )}
      </span>

      {/* Desktop: full breadcrumb trail */}
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const segmentKey = segment as Parameters<typeof t>[0];
        const label = t.has(segmentKey) ? t(segmentKey) : decodeURIComponent(segment);

        return (
          <span key={href} className="hidden sm:flex items-center gap-1">
            {index > 0 && <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
            {isLast ? (
              <span className="font-medium text-foreground flex items-center gap-1.5">
                {label}
                {extra.resultCount !== undefined && extra.resultCount > 0 && (
                  <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground min-w-[20px]">
                    {extra.resultCount}
                  </span>
                )}
              </span>
            ) : (
              <Link
                href={href}
                className="hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

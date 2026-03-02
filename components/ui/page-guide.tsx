'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HelpCircle, Lightbulb, Target, BookOpen } from 'lucide-react';
import { getModuleGuide } from '@/lib/config/module-guide';
import { cn } from '@/lib/utils/cn';

interface PageGuideProps {
  /** Override the auto-detected module path */
  modulePath?: string;
  /** Custom class for the trigger button */
  className?: string;
  /** Show as icon-only button (default) or with label */
  variant?: 'icon' | 'label';
}

/**
 * Page Guide popover — shows module description, goal, and usage tips.
 * Automatically detects the current module from the URL.
 * Place this next to any page header for contextual help.
 */
export function PageGuide({ modulePath, className, variant = 'icon' }: PageGuideProps) {
  const pathname = usePathname();
  const guide = getModuleGuide(modulePath || pathname);
  const [open, setOpen] = useState(false);

  if (!guide) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'icon' ? 'icon' : 'sm'}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-orange-500/10 transition-colors',
            variant === 'icon' ? 'h-8 w-8' : 'gap-1.5',
            className
          )}
          aria-label="دليل الاستخدام"
        >
          <HelpCircle className="h-4 w-4" />
          {variant === 'label' && <span className="text-xs">مساعدة</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-80 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-orange-500/10 dark:bg-orange-500/5 px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">دليل الاستخدام</h4>
              <p className="text-[10px] text-muted-foreground">{guide.descriptionEn}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[340px] overflow-y-auto">
          {/* Goal */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
              <Target className="h-3.5 w-3.5" />
              <span>الهدف</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{guide.goal}</p>
          </div>

          {/* Tips */}
          {guide.tips.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400">
                <Lightbulb className="h-3.5 w-3.5" />
                <span>نصائح الاستخدام</span>
              </div>
              <ul className="space-y-1">
                {guide.tips.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed"
                  >
                    <Badge
                      variant="outline"
                      className="h-4 w-4 shrink-0 rounded-full p-0 flex items-center justify-center text-[9px] font-bold border-orange-300 text-orange-500 mt-0.5"
                    >
                      {i + 1}
                    </Badge>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 bg-muted/30">
          <Link
            href="/dashboard/guide"
            className="text-[10px] text-muted-foreground hover:text-orange-600 transition-colors flex items-center gap-1"
            onClick={() => setOpen(false)}
          >
            <BookOpen className="h-3 w-3" />
            عرض دليل جميع الوحدات
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

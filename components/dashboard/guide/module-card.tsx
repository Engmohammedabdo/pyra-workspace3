'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Target, Lightbulb } from 'lucide-react';
import type { ResolvedModuleGuide } from '@/lib/i18n/module-guide-labels';

export function ModuleCard({ guide, color }: { guide: ResolvedModuleGuide; color: string }) {
  const tCommonGuide = useTranslations('common.guide');
  const tGuideUi = useTranslations('guide.ui');
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className="group hover:border-orange-300 dark:hover:border-orange-700 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {guide.description}
              <Link
                href={guide.href}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-orange-500" />
              </Link>
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-start gap-2 mb-2">
          <Target className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
          <p className="text-xs text-muted-foreground leading-relaxed">{guide.goal}</p>
        </div>

        {expanded && guide.tips.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${color}`}>
              <Lightbulb className="h-3.5 w-3.5" />
              <span>{tCommonGuide('tips')}</span>
            </div>
            <ul className="space-y-1">
              {guide.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="text-[10px] font-bold text-orange-500 mt-px">{i + 1}.</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!expanded && guide.tips.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            {tGuideUi('clickToViewTips', { count: guide.tips.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

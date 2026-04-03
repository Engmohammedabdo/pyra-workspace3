'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Zap, LayoutTemplate } from 'lucide-react';
import { AutomationTemplate, TRIGGER_LABELS } from './types';

interface TemplatesViewProps {
  loading: boolean;
  templates: AutomationTemplate[];
  onApply: (tpl: AutomationTemplate) => void;
}

export function TemplatesView({ loading, templates, onApply }: TemplatesViewProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <LayoutTemplate className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>لا توجد قوالب متاحة</p>
          <p className="text-xs mt-1">يمكنك إنشاء قاعدة يدوياً</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {templates.map(tpl => (
        <Card
          key={tpl.id}
          className="cursor-pointer hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
          onClick={() => onApply(tpl)}
        >
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-500" />
              <h3 className="font-semibold">{tpl.name}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{tpl.description}</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {TRIGGER_LABELS[tpl.trigger_event] || tpl.trigger_event}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {tpl.actions.length} إجراء
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

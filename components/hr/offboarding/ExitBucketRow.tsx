'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

export type WorkKey =
  | 'leads'
  | 'follow_ups'
  | 'tasks'
  | 'whatsapp'
  | 'lead_tasks'
  | 'direct_reports';
export type ActionKind = 'reassign' | 'reparent' | 'archive' | 'leave';

export interface BucketDef {
  key: WorkKey;
  reassignAction: 'reassign' | 'reparent';
  archivable: boolean;
  pool: 'leadCapable' | 'active';
}

export type LiteUser = { username: string; display_name: string };

/** One WORK bucket: count badge + item preview + action buttons + target select. */
export function BucketRow({
  def,
  items,
  decision,
  options,
  onSetAction,
  onSetTarget,
}: {
  def: BucketDef;
  items: { id: string; label: string }[];
  decision?: { action: string; to?: string };
  options: LiteUser[];
  onSetAction: (action: ActionKind) => void;
  onSetTarget: (to: string) => void;
}) {
  const t = useTranslations('hr.offboarding');
  const action = (decision?.action ?? 'leave') as ActionKind;
  const needsTarget = action === 'reassign' || action === 'reparent';
  const preview = items.slice(0, 3).map((i) => i.label).join('، '); // i18n-exempt: Arabic list separator (punctuation)
  const more = items.length - 3;
  const actions: ActionKind[] = [
    def.reassignAction,
    ...(def.archivable ? (['archive'] as const) : []),
    'leave',
  ];

  return (
    <Card className="space-y-3 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">{t(`handover.buckets.${def.key}`)}</span>
        <Badge variant="secondary" className="shrink-0">{items.length}</Badge>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {preview}
        {more > 0 ? ` +${more}` : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={action === a ? 'default' : 'outline'}
            className={cn('h-11', action === a && 'bg-orange-500 text-white hover:bg-orange-600')}
            onClick={() => onSetAction(a)}
          >
            {t(`handover.${a}`)}
          </Button>
        ))}
      </div>
      {needsTarget && (
        <Select value={decision?.to ?? ''} onValueChange={onSetTarget}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t('handover.selectTarget')} />
          </SelectTrigger>
          <SelectContent>
            {options.map((u) => (
              <SelectItem key={u.username} value={u.username}>{u.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Card>
  );
}

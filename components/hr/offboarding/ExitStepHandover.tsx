'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Briefcase, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeadCapableUsers } from '@/hooks/useLeadCapableUsers';
import type { HandoverList, HandoverDecisions } from '@/lib/hr/handover';
import type { ExitForm } from './exit-wizard-helpers';
import { BucketRow, type BucketDef, type WorkKey } from './ExitBucketRow';

type OnChange = (patch: Partial<ExitForm>) => void;

// leads/follow-ups/whatsapp/lead_tasks/direct_reports reassign to a lead-capable
// user; board tasks can go to any active user (isAssignableUser only requires
// active — see lib/auth/lead-scope.ts).
const WORK_BUCKETS: BucketDef[] = [
  { key: 'leads', reassignAction: 'reassign', archivable: false, pool: 'leadCapable' },
  { key: 'follow_ups', reassignAction: 'reassign', archivable: false, pool: 'leadCapable' },
  { key: 'whatsapp', reassignAction: 'reassign', archivable: false, pool: 'leadCapable' },
  { key: 'lead_tasks', reassignAction: 'reassign', archivable: false, pool: 'leadCapable' },
  { key: 'tasks', reassignAction: 'reassign', archivable: true, pool: 'active' },
  { key: 'direct_reports', reassignAction: 'reparent', archivable: false, pool: 'leadCapable' },
];

export function ExitStepHandover({
  handover,
  form,
  onChange,
}: {
  handover: HandoverList;
  form: ExitForm;
  onChange: OnChange;
}) {
  const t = useTranslations('hr.offboarding');
  const { all, leadCapable } = useLeadCapableUsers();
  const active = all.filter((u) => u.status === 'active');

  function setBucket(key: WorkKey, value: unknown) {
    onChange({ handover: { ...form.handover, [key]: value } as HandoverDecisions });
  }

  function assignAll(to: string) {
    if (!to) return;
    const next: HandoverDecisions = { ...form.handover };
    for (const b of WORK_BUCKETS) {
      if (handover[b.key].length === 0) continue;
      (next as Record<string, unknown>)[b.key] = { action: b.reassignAction, to };
    }
    onChange({ handover: next });
  }

  const activeBuckets = WORK_BUCKETS.filter((b) => handover[b.key].length > 0);
  const ext = handover.external_files;
  const extHostsLabel = ext.hosts.join('، '); // i18n-exempt: Arabic list separator (punctuation)
  const access = handover.access;
  const accessRows = (
    [
      ['accessBoardMembers', access.board_members],
      ['accessTeamMembers', access.team_members],
      ['accessWaSettings', access.wa_settings],
      ['accessFavorites', access.favorites],
    ] as [
      'accessBoardMembers' | 'accessTeamMembers' | 'accessWaSettings' | 'accessFavorites',
      number,
    ][]
  ).filter(([, n]) => n > 0);

  return (
    <div className="space-y-4">
      {/* 🔵 WORK */}
      <div className="flex items-center gap-2">
        <Briefcase className="size-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <h3 className="text-sm font-semibold">{t('handover.heading')}</h3>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t('handover.subheading')}</p>

      {activeBuckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('handover.emptyWork')}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/40 dark:bg-blue-950/30">
            <span className="shrink-0 text-sm font-medium text-blue-700 dark:text-blue-300">
              {t('handover.assignAll')}
            </span>
            <Select onValueChange={assignAll}>
              <SelectTrigger className="h-11 flex-1">
                <SelectValue placeholder={t('handover.assignAllPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {leadCapable.map((u) => (
                  <SelectItem key={u.username} value={u.username}>{u.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeBuckets.map((b) => (
            <BucketRow
              key={b.key}
              def={b}
              items={handover[b.key]}
              decision={form.handover[b.key]}
              options={b.pool === 'active' ? active : leadCapable}
              onSetAction={(a) =>
                setBucket(b.key, a === 'leave' ? { action: 'leave' } : { action: a, to: form.handover[b.key]?.to })
              }
              onSetTarget={(to) => setBucket(b.key, { action: b.reassignAction, to })}
            />
          ))}
        </>
      )}

      {/* 🟠 ACCESS — informational, no control */}
      {accessRows.length > 0 && (
        <Card className="space-y-2 border-amber-200 p-4 dark:border-amber-800/40">
          <div className="flex items-center gap-2">
            <ShieldOff className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            <h3 className="text-sm font-semibold">{t('handover.accessTitle')}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{t('handover.accessAutoRemoved')}</p>
          <div className="flex flex-wrap gap-1.5">
            {accessRows.map(([k, n]) => (
              <Badge key={k} variant="secondary">
                {t(`handover.${k}`)}: {n}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* 🔴 EXTERNAL-DEPENDENCY — warning + acknowledge */}
      {ext.count > 0 && (
        <Card className="space-y-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-700/50 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {t('handover.externalTitle')}
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t('handover.externalFilesWarning', { count: ext.count })}
              </p>
              {ext.hosts.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t('handover.externalFilesHosts', { hosts: extHostsLabel })}
                </p>
              )}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 ps-7">
            <Checkbox
              checked={form.handover.external_files_acknowledged === true}
              onCheckedChange={(v) =>
                onChange({ handover: { ...form.handover, external_files_acknowledged: v === true } })
              }
            />
            <span className="text-sm text-amber-800 dark:text-amber-200">
              {t('handover.externalFilesAck')}
            </span>
          </label>
        </Card>
      )}
    </div>
  );
}

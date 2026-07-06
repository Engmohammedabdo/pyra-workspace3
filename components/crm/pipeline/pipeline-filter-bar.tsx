'use client';

/**
 * Filter bar for the Pipeline view.
 *
 * State lives in the URL via useSearchParams so filters survive refresh and
 * are shareable. Submitting just calls router.replace() — useLeads picks up
 * the new params via its query key and refetches automatically.
 *
 * Mobile: collapses into a single search row + a "فلاتر" toggle that opens // i18n-exempt: doc comment
 * the rest below it (handled by the wrapping page, not here).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStatusLabels } from '@/lib/i18n/status-labels';

interface PipelineFilterBarProps {
  /** Render owner-filter dropdown only for admins (sales agents see only their own leads). */
  isAdmin: boolean;
  /** Owner usernames the admin can choose from (derived from current leads). */
  ownerOptions?: Array<{ value: string; label: string }>;
  /** Total leads visible after current filters (rendered as a small live counter). */
  total?: number;
}

const SOURCE_VALUES = ['whatsapp', 'website', 'referral', 'manual', 'ad', 'social'] as const;
const PRIORITY_VALUES = ['urgent', 'high', 'medium', 'low'] as const;

export function PipelineFilterBar({ isAdmin, ownerOptions = [], total }: PipelineFilterBarProps) {
  const t = useTranslations('crm.pipeline.filterBar');
  const priorityLabel = useStatusLabels('leadPriority');
  const router = useRouter();
  const sp = useSearchParams();

  const SOURCE_OPTIONS = useMemo(
    () => SOURCE_VALUES.map((value) => ({ value, label: t(`sources.${value}`) })),
    [t],
  );
  const PRIORITY_OPTIONS = useMemo(
    () => PRIORITY_VALUES.map((value) => ({ value, label: priorityLabel(value) })),
    [priorityLabel],
  );

  const initialSearch = sp.get('search') ?? '';
  const owner = sp.get('assigned_to') ?? 'all';
  const source = sp.get('source') ?? 'all';
  const priority = sp.get('priority') ?? 'all';

  const [searchInput, setSearchInput] = useState(initialSearch);

  // Keep input in sync if URL changes from outside (e.g. browser back).
  useEffect(() => {
    setSearchInput(initialSearch);
  }, [initialSearch]);

  // Apply a single param change to the URL, replacing the existing entry.
  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value && value !== 'all') next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, sp],
  );

  // Debounce search → URL.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== initialSearch) setParam('search', searchInput.trim() || null);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, initialSearch, setParam]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (initialSearch) n++;
    if (owner !== 'all') n++;
    if (source !== 'all') n++;
    if (priority !== 'all') n++;
    return n;
  }, [initialSearch, owner, source, priority]);

  function clearAll() {
    router.replace('?', { scroll: false });
    setSearchInput('');
  }

  // Resolve human-readable labels for the active-filter chip strip below.
  // Source + priority labels come from the option arrays built above.
  // Owner is rendered as the raw username (the dropdown also shows raw
  // usernames — there's no display_name lookup in this surface; admin
  // recognizes their own team).
  const sourceChipLabel = SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;
  const priorityChipLabel = PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground pointer-events-none" />
          {/* Phase 10 Commit 4: h-11 (44px) per WCAG 2.5.5 + Apple HIG touch
              target minimum. shadcn Input default is h-10 (40px). */}
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="ps-9 h-11"
          />
        </div>

        {isAdmin && ownerOptions.length > 0 && (
          <Select value={owner} onValueChange={(v) => setParam('assigned_to', v)}>
            <SelectTrigger className="w-40 h-11">
              <SelectValue placeholder={t('ownerPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allOwners')}</SelectItem>
              {ownerOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={source} onValueChange={(v) => setParam('source', v)}>
          <SelectTrigger className="w-36 h-11">
            <SelectValue placeholder={t('sourcePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSources')}</SelectItem>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setParam('priority', v)}>
          <SelectTrigger className="w-36 h-11">
            <SelectValue placeholder={t('priorityPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allPriorities')}</SelectItem>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Phase 10 Commit 4: h-11 (44px) for touch compliance. Dropped
            `size="sm"` (was h-9 = 36px) since the explicit className
            override would conflict semantically. */}
        {activeCount > 0 && (
          <Button variant="ghost" onClick={clearAll} className="gap-1 h-11">
            <X className="size-3.5" /> {t('clear', { count: activeCount })}
          </Button>
        )}

        {typeof total === 'number' && (
          <span className="text-xs text-muted-foreground ms-auto tabular-nums">
            {t('total', { count: total })}
          </span>
        )}
      </div>

      {/* Phase 10 Commit 4: active-filter chip strip — mobile only.
          Provides instant visibility into which filters are active without
          forcing the user to scan each Select trigger's current value.
          Matches the workspace's cleanest filter feedback pattern (originally
          from the legacy follow-ups client, since migrated to
          app/dashboard/crm/follow-ups/). Read-only; users adjust filters
          via the Selects above or clear all via "مسح". Per-chip × removal // i18n-exempt: doc comment
          deferred to v1.1. */}
      {activeCount > 0 && (
        <div className="md:hidden mt-2 flex flex-wrap gap-1.5">
          {initialSearch && (
            <Badge variant="secondary" className="text-xs gap-1">
              {t('chips.search', { query: initialSearch })}
            </Badge>
          )}
          {owner !== 'all' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {t('chips.owner', { owner })}
            </Badge>
          )}
          {source !== 'all' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {t('chips.source', { source: sourceChipLabel })}
            </Badge>
          )}
          {priority !== 'all' && (
            <Badge variant="secondary" className="text-xs gap-1">
              {t('chips.priority', { priority: priorityChipLabel })}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

// CR-T3 — Pyra Pro top bar: title, three counter-chip quick filters
// (needs_reply/unassigned/late — counts are server-computed, see
// app/api/dashboard/sales/whatsapp/conversations/route.ts meta.counts, NEVER
// derived from the fetched page), a Ctrl+K search hint, and the line
// switcher segmented control (promoted out of the filter popover per the
// approved mockup — the popover itself stays, see filter-bar.tsx).
//
// i18n-exempt: components/sales/chat/** is Phase 6e, not yet migrated —
// Arabic literals match the rest of this surface.

import { useEffect } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useWAInstances } from '@/hooks/useWhatsApp';
import { lineLabel, isNonCompanyLine } from './line-label';
import { useChatStore, type QuickFilterKey } from './use-chat-store';

interface TopBarProps {
  counts: Record<string, number>;
  // «غير مسند» only makes sense for admins — an agent's own scope never has
  // unassigned rows to pick up (see the chip's countKey comment below), so
  // showing it to an agent is a chip that always filters to an empty list.
  isAdmin?: boolean;
}

type Tone = 'orange' | 'amber' | 'red';

const TONE_CLASSES: Record<Tone, { active: string; inactive: string }> = {
  orange: {
    inactive: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/15',
    active: 'border-orange-500/40 bg-orange-500/20 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/30',
  },
  amber: {
    inactive: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15',
    active: 'border-amber-500/40 bg-amber-500/20 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30',
  },
  red: {
    inactive: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/15',
    active: 'border-red-500/40 bg-red-500/20 text-red-700 dark:text-red-300 ring-2 ring-red-500/30',
  },
};

const CHIPS: Array<{ key: QuickFilterKey; label: string; tone: Tone; countKey: string }> = [
  { key: 'needs_reply', label: 'محتاج رد', tone: 'orange', countKey: 'needs_reply' },
  { key: 'unassigned', label: 'غير مسند', tone: 'amber', countKey: 'unassigned' },
  { key: 'late', label: 'متأخر', tone: 'red', countKey: 'late' },
];

export function TopBar({ counts, isAdmin }: TopBarProps) {
  const { filters, setFilters, quickFilter, setQuickFilter } = useChatStore();
  const { data: waInstances = [] } = useWAInstances();
  // Agents only ever see their own scope (assigned-to-me + the shared
  // unassigned pool is admin's job to distribute) — an agent has no reason
  // to filter by "unassigned" and the tab it maps to isn't even in their
  // visibleTabs (chat-layout.tsx), so hide the chip rather than ship a
  // control that always narrows to an empty list.
  const visibleChips = isAdmin ? CHIPS : CHIPS.filter(c => c.key !== 'unassigned');

  // Ctrl/Cmd+K — focuses the conversation search input (id="wa-conv-search",
  // set on the list's own search box in conversation-list.tsx).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('wa-conv-search')?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function toggleQuickFilter(key: QuickFilterKey) {
    setQuickFilter(quickFilter === key ? '' : key);
  }

  function setInstance(instanceName: string) {
    setFilters({ ...filters, instance: instanceName });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2.5 border border-border">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-primary" />
        </div>
        <h1 className="text-base font-bold tracking-tight text-foreground">المحادثات</h1>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {visibleChips.map(chip => {
          const isActive = quickFilter === chip.key;
          const tone = TONE_CLASSES[chip.tone];
          const count = counts[chip.countKey] ?? 0;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => toggleQuickFilter(chip.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                isActive ? tone.active : tone.inactive
              )}
            >
              {chip.label}
              {count > 0 && <span className="tabular-nums font-bold">{count}</span>}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => document.getElementById('wa-conv-search')?.focus()}
        className="hidden sm:inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="h-3 w-3" />
        <kbd className="font-mono">Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted p-1">
        <button
          type="button"
          onClick={() => setInstance('')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            !filters.instance ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          الكل
        </button>
        {waInstances.map(inst => {
          const active = filters.instance === inst.instance_name;
          return (
            <button
              key={inst.id}
              type="button"
              onClick={() => setInstance(inst.instance_name)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isNonCompanyLine(inst.instance_name) ? 'bg-emerald-500' : 'bg-orange-500'
                )}
              />
              {lineLabel(inst.instance_name)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

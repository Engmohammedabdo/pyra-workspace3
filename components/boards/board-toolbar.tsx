'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dubaiDayKey } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';
import {
  compareBoardTaskDeadlines,
  getBoardTaskDeadline,
  isBoardTaskDeadlineOverdue,
} from '@/hooks/useBoardTasks';
import {
  Search, Filter, LayoutGrid, List, GitBranch, Users, Tag, Flag, CalendarClock, X, ArrowUpDown,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type ViewMode = 'kanban' | 'pipeline' | 'list' | 'calendar';

export type SortOption = 'position' | 'newest' | 'oldest' | 'priority' | 'due_date' | 'title';

export interface BoardFilters {
  search: string;
  assignees: string[];
  labels: string[];
  priorities: string[];
  dueDateFilter: '' | 'overdue' | 'today' | 'week' | 'none';
  sortBy: SortOption;
}

export const EMPTY_FILTERS: BoardFilters = {
  search: '', assignees: [], labels: [], priorities: [], dueDateFilter: '', sortBy: 'position',
};

interface BoardToolbarProps {
  taskCount: number;
  columnCount: number;
  isPipeline: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  assigneeList: string[];
  labelList: { id: string; name: string; color: string }[];
  onSettingsClick: () => void;
  canManage: boolean;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const PRIORITY_KEYS = [
  { key: 'urgent', color: 'bg-red-500' },
  { key: 'high', color: 'bg-orange-500' },
  { key: 'medium', color: 'bg-blue-500' },
  { key: 'low', color: 'bg-gray-400' },
] as const;

const DUE_FILTER_KEYS = [
  { key: 'overdue', color: 'text-red-500' },
  { key: 'today', color: 'text-blue-500' },
  { key: 'week', color: 'text-green-500' },
  { key: 'none', color: 'text-gray-400' },
] as const;

const LABEL_DOT: Record<string, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
  green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
  pink: 'bg-pink-500', indigo: 'bg-indigo-500', gray: 'bg-gray-500',
};

// ═══════════════════════════════════════════════════════════
// Filter logic (exported for use in parent)
// ═══════════════════════════════════════════════════════════

const PRIORITY_SORT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function applyFilters<T extends {
  id: string; title: string; priority: string; column_id: string; position: number;
  due_date?: string | null; due_at?: string | null; created_at?: string;
  production_deadline_exempt?: boolean;
  pyra_task_assignees?: { username: string }[];
  pyra_task_labels?: { label_id?: string }[];
}>(
  tasks: T[],
  filters: BoardFilters,
  locale: string = 'ar',
  now: Date = new Date(),
  doneColumnIds: ReadonlySet<string> = new Set(),
): T[] {
  const today = dubaiDayKey(now);
  const weekEnd = dubaiDayKey(new Date(now.getTime() + 7 * 86400000));

  const filtered = tasks.filter(t => {
    const deadline = getBoardTaskDeadline(t);
    // Search
    if (filters.search && !t.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
    // Assignee
    if (filters.assignees.length > 0) {
      const taskAssignees = (t.pyra_task_assignees || []).map(a => a.username);
      if (!filters.assignees.some(a => taskAssignees.includes(a))) return false;
    }
    // Label
    if (filters.labels.length > 0) {
      const taskLabelIds = (t.pyra_task_labels || []).map(l => l.label_id);
      if (!filters.labels.some(l => taskLabelIds.includes(l))) return false;
    }
    // Priority
    if (filters.priorities.length > 0 && !filters.priorities.includes(t.priority)) return false;
    // Due date
    if (
      filters.dueDateFilter === 'overdue'
      && !isBoardTaskDeadlineOverdue(t, now, doneColumnIds.has(t.column_id))
    ) return false;
    if (filters.dueDateFilter === 'today' && deadline?.date !== today) return false;
    if (
      filters.dueDateFilter === 'week'
      && !(deadline?.date && deadline.date >= today && deadline.date <= weekEnd)
    ) return false;
    if (filters.dueDateFilter === 'none' && deadline?.date) return false;
    return true;
  });

  // Sort
  if (filters.sortBy && filters.sortBy !== 'position') {
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'newest': return (b.created_at || '').localeCompare(a.created_at || '');
        case 'oldest': return (a.created_at || '').localeCompare(b.created_at || '');
        case 'priority': return (PRIORITY_SORT[a.priority] ?? 2) - (PRIORITY_SORT[b.priority] ?? 2);
        case 'due_date': return compareBoardTaskDeadlines(a, b);
        case 'title': return a.title.localeCompare(b.title, locale);
        default: return 0;
      }
    });
  }

  return filtered;
}

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export function BoardToolbar({
  taskCount, columnCount, isPipeline, viewMode, onViewModeChange,
  filters, onFiltersChange, assigneeList, labelList, onSettingsClick, canManage,
}: BoardToolbarProps) {
  const t = useTranslations('boards.toolbar');
  const locale = useLocale() as Locale;
  const priorityLabel = useStatusLabels('taskPriority');
  const dueFilterLabel = useTranslations('boards.toolbar.dueFilters');
  const sortLabel = useTranslations('boards.toolbar.sort');
  const activeFilterCount =
    filters.assignees.length + filters.labels.length + filters.priorities.length +
    (filters.dueDateFilter ? 1 : 0);

  const updateFilter = <K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: 'assignees' | 'labels' | 'priorities', value: string) => {
    const arr = filters[key];
    const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
    updateFilter(key, next);
  };

  const clearFilters = () => onFiltersChange(EMPTY_FILTERS);

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 flex-wrap bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={e => updateFilter('search', e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="h-8 w-44 ps-8 text-xs"
        />
        {filters.search && (
          <button onClick={() => updateFilter('search', '')} className="absolute end-2 top-1/2 -translate-y-1/2">
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Assignee filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', filters.assignees.length > 0 && 'border-orange-400 bg-orange-500/5')}>
            <Users className="h-3.5 w-3.5" />
            {t('assignees')}
            {filters.assignees.length > 0 && <Badge className="h-4 w-4 p-0 text-[9px] bg-orange-500 text-white justify-center">{filters.assignees.length}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-44 p-1">
          {assigneeList.map(u => (
            <button
              key={u}
              onClick={() => toggleArrayFilter('assignees', u)}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted', filters.assignees.includes(u) && 'bg-orange-500/10')}
            >
              <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white', filters.assignees.includes(u) ? 'bg-orange-500' : 'bg-gray-400')}>
                {u.slice(0, 2).toUpperCase()}
              </div>
              {u}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Label filter */}
      {labelList.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', filters.labels.length > 0 && 'border-orange-400 bg-orange-500/5')}>
              <Tag className="h-3.5 w-3.5" />
              {t('labels')}
              {filters.labels.length > 0 && <Badge className="h-4 w-4 p-0 text-[9px] bg-orange-500 text-white justify-center">{filters.labels.length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            {labelList.map(l => (
              <button
                key={l.id}
                onClick={() => toggleArrayFilter('labels', l.id)}
                className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted', filters.labels.includes(l.id) && 'bg-orange-500/10')}
              >
                <div className={cn('w-3 h-3 rounded-sm', LABEL_DOT[l.color] || 'bg-gray-500')} />
                {l.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Priority filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', filters.priorities.length > 0 && 'border-orange-400 bg-orange-500/5')}>
            <Flag className="h-3.5 w-3.5" />
            {t('priority')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-36 p-1">
          {PRIORITY_KEYS.map(p => (
            <button
              key={p.key}
              onClick={() => toggleArrayFilter('priorities', p.key)}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted', filters.priorities.includes(p.key) && 'bg-orange-500/10')}
            >
              <div className={cn('w-2.5 h-2.5 rounded-full', p.color)} />
              {priorityLabel(p.key)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Due date filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', filters.dueDateFilter && 'border-orange-400 bg-orange-500/5')}>
            <CalendarClock className="h-3.5 w-3.5" />
            {t('dueDate')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-36 p-1">
          {DUE_FILTER_KEYS.map(d => (
            <button
              key={d.key}
              onClick={() => updateFilter('dueDateFilter', filters.dueDateFilter === d.key ? '' : d.key as BoardFilters['dueDateFilter'])}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted', filters.dueDateFilter === d.key && 'bg-orange-500/10')}
            >
              <span className={d.color}>●</span>
              {dueFilterLabel(d.key)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Sort */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', filters.sortBy !== 'position' && 'border-orange-400 bg-orange-500/5')}>
            <ArrowUpDown className="h-3.5 w-3.5" />
            {t('sortLabel')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-36 p-1">
          {(['position', 'newest', 'oldest', 'priority', 'due_date', 'title'] as const).map(s => (
            <button
              key={s}
              onClick={() => updateFilter('sortBy', s)}
              className={cn('w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs text-start hover:bg-muted', filters.sortBy === s && 'bg-orange-500/10')}
            >
              {sortLabel(s)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Clear filters */}
      {activeFilterCount > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
          <X className="h-3 w-3 me-1" /> {t('clearFilters', { count: activeFilterCount })}
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {t('stats', { taskCount, columnCount, mode: isPipeline ? 'pipeline' : 'kanban' })}
      </span>

      {/* View toggle — segmented control */}
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        <button
          onClick={() => onViewModeChange('kanban')}
          className={cn('h-7 px-2.5 rounded-md text-xs flex items-center gap-1 transition-colors',
            viewMode === 'kanban'
              ? 'bg-background shadow-sm text-orange-600 dark:text-orange-400 font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('viewKanban')}</span>
        </button>
        {isPipeline && (
          <button
            onClick={() => onViewModeChange('pipeline')}
            className={cn('h-7 px-2.5 rounded-md text-xs flex items-center gap-1 transition-colors',
              viewMode === 'pipeline'
                ? 'bg-background shadow-sm text-orange-600 dark:text-orange-400 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('viewPipeline')}</span>
          </button>
        )}
        <button
          onClick={() => onViewModeChange('list')}
          className={cn('h-7 px-2.5 rounded-md text-xs flex items-center gap-1 transition-colors',
            viewMode === 'list'
              ? 'bg-background shadow-sm text-orange-600 dark:text-orange-400 font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('viewList')}</span>
        </button>
        <button
          onClick={() => onViewModeChange('calendar')}
          className={cn('h-7 px-2.5 rounded-md text-xs flex items-center gap-1 transition-colors',
            viewMode === 'calendar'
              ? 'bg-background shadow-sm text-orange-600 dark:text-orange-400 font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('viewCalendar')}</span>
        </button>
      </div>
    </div>
  );
}

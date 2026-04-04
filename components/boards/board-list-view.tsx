'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ChevronUp, ChevronDown, ArrowRightLeft, Flag, Archive, Check, CheckSquare, ClipboardList,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface Task {
  id: string;
  title: string;
  column_id: string;
  position: number;
  priority: string;
  due_date?: string;
  pyra_task_assignees?: { username: string }[];
  pyra_task_labels?: { label_id?: string; pyra_board_labels: { name: string; color: string } }[];
  pyra_task_checklist?: { id: string; title: string; is_checked: boolean }[];
}

interface Column {
  id: string;
  name: string;
  color: string;
}

interface BoardListViewProps {
  tasks: Task[];
  columns: Column[];
  boardId: string;
  onTaskClick: (task: Task) => void;
  onUpdate: () => void;
  canEdit: boolean;
}

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  low: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'عاجل', high: 'مرتفع', medium: 'متوسط', low: 'منخفض',
};

const LABEL_BG: Record<string, string> = {
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  yellow: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  gray: 'bg-gray-500/15 text-gray-700 dark:text-gray-300',
};

type SortKey = 'title' | 'column' | 'priority' | 'due_date';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

// ═══════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════

export function BoardListView({ tasks, columns, boardId, onTaskClick, onUpdate, canEdit }: BoardListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('column');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const colMap = new Map(columns.map(c => [c.id, c]));

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'title': cmp = a.title.localeCompare(b.title, 'ar'); break;
      case 'column': {
        const ca = colMap.get(a.column_id);
        const cb = colMap.get(b.column_id);
        cmp = (ca?.name || '').localeCompare(cb?.name || '', 'ar');
        break;
      }
      case 'priority': cmp = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2); break;
      case 'due_date': cmp = (a.due_date || '9999').localeCompare(b.due_date || '9999'); break;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map(t => t.id)));
  };

  const handleBulkAction = async (action: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);

    if (action.startsWith('move:')) {
      const colId = action.replace('move:', '');
      for (const id of ids) {
        await mutateAPI(`/api/tasks/${id}/move`, 'POST', { column_id: colId, position: 0 });
      }
      toast.success(`تم نقل ${ids.length} مهمة`);
    } else if (action.startsWith('priority:')) {
      const pri = action.replace('priority:', '');
      for (const id of ids) {
        await mutateAPI(`/api/tasks/${id}`, 'PATCH', { priority: pri });
      }
      toast.success(`تم تغيير أولوية ${ids.length} مهمة`);
    } else if (action === 'archive') {
      for (const id of ids) {
        await mutateAPI(`/api/tasks/${id}`, 'PATCH', { is_archived: true });
      }
      toast.success(`تم أرشفة ${ids.length} مهمة`);
    }

    setSelected(new Set());
    setBulkAction('');
    onUpdate();
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <div className="space-y-3">
      {/* Bulk actions bar */}
      {selected.size > 0 && canEdit && (
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
          <Badge className="bg-orange-500 text-white">{selected.size}</Badge>
          <span className="text-xs">محدد</span>

          <Select value={bulkAction} onValueChange={v => { setBulkAction(v); handleBulkAction(v); }}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="نقل إلى..." />
            </SelectTrigger>
            <SelectContent>
              {columns.map(c => (
                <SelectItem key={c.id} value={`move:${c.id}`} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value="" onValueChange={v => handleBulkAction(v)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue placeholder="أولوية..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={`priority:${k}`} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleBulkAction('archive')}>
            <Archive className="h-3 w-3 me-1" /> أرشفة
          </Button>

          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            إلغاء
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-border/60 rounded-xl overflow-hidden bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                {canEdit && (
                  <th className="w-10 p-2.5">
                    <button onClick={toggleAll} className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                      selected.size === sorted.length && sorted.length > 0 ? 'bg-orange-500 border-orange-500' : 'border-border'
                    )}>
                      {selected.size === sorted.length && sorted.length > 0 && <Check className="h-3 w-3 text-white" />}
                    </button>
                  </th>
                )}
                <th className="text-start p-2.5 cursor-pointer hover:text-foreground text-muted-foreground text-xs font-medium" onClick={() => toggleSort('title')}>
                  <span className="flex items-center gap-1">العنوان <SortIcon k="title" /></span>
                </th>
                <th className="text-start p-2.5 cursor-pointer hover:text-foreground text-muted-foreground text-xs font-medium w-32" onClick={() => toggleSort('column')}>
                  <span className="flex items-center gap-1">القائمة <SortIcon k="column" /></span>
                </th>
                <th className="text-start p-2.5 text-muted-foreground text-xs font-medium w-28">الأعضاء</th>
                <th className="text-start p-2.5 cursor-pointer hover:text-foreground text-muted-foreground text-xs font-medium w-24" onClick={() => toggleSort('priority')}>
                  <span className="flex items-center gap-1">الأولوية <SortIcon k="priority" /></span>
                </th>
                <th className="text-start p-2.5 cursor-pointer hover:text-foreground text-muted-foreground text-xs font-medium w-28" onClick={() => toggleSort('due_date')}>
                  <span className="flex items-center gap-1">الاستحقاق <SortIcon k="due_date" /></span>
                </th>
                <th className="text-start p-2.5 text-muted-foreground text-xs font-medium w-24">التصنيفات</th>
                <th className="text-start p-2.5 text-muted-foreground text-xs font-medium w-16">قائمة</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(task => {
                const col = colMap.get(task.column_id);
                const isOverdue = task.due_date && task.due_date < today;
                const checks = task.pyra_task_checklist || [];
                const checkDone = checks.filter(c => c.is_checked).length;
                return (
                  <tr
                    key={task.id}
                    className={cn(
                      'border-b border-border/20 hover:bg-muted/30 transition-colors cursor-pointer',
                      selected.has(task.id) && 'bg-orange-500/5'
                    )}
                    onClick={() => onTaskClick(task)}
                  >
                    {canEdit && (
                      <td className="p-2.5" onClick={e => { e.stopPropagation(); toggleSelect(task.id); }}>
                        <div className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          selected.has(task.id) ? 'bg-orange-500 border-orange-500' : 'border-border'
                        )}>
                          {selected.has(task.id) && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </td>
                    )}
                    <td className="p-2.5">
                      <span className="font-medium text-sm">{task.title}</span>
                    </td>
                    <td className="p-2.5">
                      <Badge variant="outline" className="text-[10px]">{col?.name || '—'}</Badge>
                    </td>
                    <td className="p-2.5">
                      <div className="flex -space-x-1">
                        {(task.pyra_task_assignees || []).slice(0, 3).map(a => (
                          <Avatar key={a.username} className="h-5 w-5 border border-background">
                            <AvatarFallback className="text-[7px] bg-orange-500/20 text-orange-600">{a.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5">
                      <Badge className={cn('text-[10px] border-0', PRIORITY_BADGE[task.priority])}>
                        {PRIORITY_LABEL[task.priority]}
                      </Badge>
                    </td>
                    <td className="p-2.5">
                      {task.due_date ? (
                        <span className={cn('text-xs', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                          {new Date(task.due_date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : <span className="text-xs text-muted-foreground/30">—</span>}
                    </td>
                    <td className="p-2.5">
                      <div className="flex flex-wrap gap-0.5">
                        {(task.pyra_task_labels || []).slice(0, 2).map(l => (
                          <Badge key={l.label_id} className={cn('text-[9px] px-1 h-4 border-0', LABEL_BG[l.pyra_board_labels.color])}>
                            {l.pyra_board_labels.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5">
                      {checks.length > 0 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <CheckSquare className="h-3 w-3" />
                          {checkDone}/{checks.length}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <EmptyState icon={ClipboardList} title="لا توجد مهام مطابقة" className="py-8" />
          )}
        </div>
      </div>
    </div>
  );
}

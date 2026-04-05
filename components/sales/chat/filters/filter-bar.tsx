'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import { Filter, X, Check, User } from 'lucide-react';
import { useConversationLabels } from '@/hooks/useWhatsApp';
import { useUsers } from '@/hooks/useUsers';
import { useChatStore, type FilterState } from '../use-chat-store';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'عاجل', color: 'bg-red-500' },
  { value: 'high', label: 'مرتفع', color: 'bg-orange-500' },
  { value: 'normal', label: 'عادي', color: 'bg-blue-500' },
  { value: 'low', label: 'منخفض', color: 'bg-green-500' },
];

export function FilterBar() {
  const { filters, setFilters, resetFilters, activeFilterCount } = useChatStore();
  const { data: labels = [] } = useConversationLabels();
  const { data: users = [] } = useUsers();

  // Build agent list from users (only those with relevant roles)
  const agents = users
    .filter(u => u.role === 'admin' || u.role === 'sales_agent')
    .map(u => ({
      username: (u as Record<string, unknown>).username as string || u.name || u.id,
      display_name: u.name || u.email || u.id,
    }))
    .filter(a => a.username);

  function togglePriority(p: string) {
    const current = filters.priority;
    const next = current.includes(p)
      ? current.filter(x => x !== p)
      : [...current, p];
    setFilters({ ...filters, priority: next });
  }

  function toggleAgent(username: string) {
    const current = filters.assignedTo;
    const next = current.includes(username)
      ? current.filter(x => x !== username)
      : [...current, username];
    setFilters({ ...filters, assignedTo: next });
  }

  function setLabel(labelId: string) {
    setFilters({ ...filters, label: filters.label === labelId ? '' : labelId });
  }

  const activeLabel = filters.label ? labels.find(lb => lb.id === filters.label) : null;
  const activeLabelChip = activeLabel ? (
    <span className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5 text-[10px]">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeLabel.color }} />
      {activeLabel.name_ar || activeLabel.name}
      <button onClick={() => setLabel(activeLabel.id)} className="hover:text-destructive">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  ) : null;

  if (activeFilterCount === 0) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs h-7 gap-1 text-muted-foreground"
          >
            <Filter className="h-3 w-3" />
            فلاتر
          </Button>
        </PopoverTrigger>
        <FilterContent
          filters={filters}
          labels={labels}
          agents={agents}
          onTogglePriority={togglePriority}
          onToggleAgent={toggleAgent}
          onSetLabel={setLabel}
          onReset={resetFilters}
        />
      </Popover>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs h-7 gap-1 border-orange-300 dark:border-orange-700"
          >
            <Filter className="h-3 w-3 text-orange-500" />
            فلاتر
            <span className="bg-orange-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          </Button>
        </PopoverTrigger>
        <FilterContent
          filters={filters}
          labels={labels}
          agents={agents}
          onTogglePriority={togglePriority}
          onToggleAgent={toggleAgent}
          onSetLabel={setLabel}
          onReset={resetFilters}
        />
      </Popover>

      {/* Active filter chips */}
      {filters.priority.map(p => {
        const opt = PRIORITY_OPTIONS.find(o => o.value === p);
        return (
          <span key={p} className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5 text-[10px]">
            <span className={cn('w-1.5 h-1.5 rounded-full', opt?.color)} />
            {opt?.label}
            <button onClick={() => togglePriority(p)} className="hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {filters.assignedTo.map(agentUsername => {
        const agent = agents.find(a => a.username === agentUsername);
        return (
          <span key={agentUsername} className="flex items-center gap-1 bg-muted/50 rounded-full px-2 py-0.5 text-[10px]">
            <User className="h-2.5 w-2.5 text-blue-500" />
            {agent?.display_name || agentUsername}
            <button onClick={() => toggleAgent(agentUsername)} className="hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {activeLabelChip}

      <button
        onClick={resetFilters}
        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
      >
        مسح الفلاتر
      </button>
    </div>
  );
}

function FilterContent({
  filters,
  labels,
  agents,
  onTogglePriority,
  onToggleAgent,
  onSetLabel,
  onReset,
}: {
  filters: FilterState;
  labels: Array<{ id: string; name: string; name_ar: string; color: string }>;
  agents: Array<{ username: string; display_name: string }>;
  onTogglePriority: (p: string) => void;
  onToggleAgent: (username: string) => void;
  onSetLabel: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <PopoverContent className="w-56 p-0" align="start">
      {/* Priority */}
      <div className="p-3 border-b border-border/40">
        <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">
          الأولوية
        </h4>
        <div className="space-y-0.5">
          {PRIORITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onTogglePriority(opt.value)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors"
            >
              <span className={cn('w-2.5 h-2.5 rounded-full', opt.color)} />
              <span className="flex-1 text-start">{opt.label}</span>
              {filters.priority.includes(opt.value) && (
                <Check className="h-3 w-3 text-emerald-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Agents */}
      {agents.length > 0 && (
        <div className="p-3 border-b border-border/40">
          <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">
            الوكيل
          </h4>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {agents.map(agent => (
              <button
                key={agent.username}
                onClick={() => onToggleAgent(agent.username)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors"
              >
                <User className="h-3 w-3 text-blue-500 shrink-0" />
                <span className="flex-1 text-start truncate">{agent.display_name}</span>
                {filters.assignedTo.includes(agent.username) && (
                  <Check className="h-3 w-3 text-emerald-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <div className="p-3 border-b border-border/40">
          <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase mb-2">
            التسميات
          </h4>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {labels.map(label => (
              <button
                key={label.id}
                onClick={() => onSetLabel(label.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                <span className="flex-1 text-start truncate">{label.name_ar || label.name}</span>
                {filters.label === label.id && (
                  <Check className="h-3 w-3 text-emerald-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reset */}
      <div className="p-2">
        <button
          onClick={onReset}
          className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
        >
          مسح جميع الفلاتر
        </button>
      </div>
    </PopoverContent>
  );
}

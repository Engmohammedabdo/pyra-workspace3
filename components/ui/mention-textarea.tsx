'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Loader2, AtSign } from 'lucide-react';

interface MemberItem {
  display_name: string;
  username?: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Project ID — for project-scoped member fetching */
  projectId?: string;
  /** Task ID — for task-scoped member fetching */
  taskId?: string;
  /** Styling variant */
  variant?: 'dashboard' | 'portal';
  /** Additional onKeyDown handler (only called when dropdown is NOT active) */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  id?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * Textarea with @mention autocomplete.
 *
 * Context-aware: fetches mentionable users scoped to the project or task.
 * Supports both dashboard and portal variants with appropriate styling.
 */
export function MentionTextarea({
  value,
  onChange,
  projectId,
  taskId,
  variant = 'dashboard',
  onKeyDown: parentOnKeyDown,
  placeholder,
  className,
  rows = 3,
  id,
  required,
  maxLength,
  disabled,
}: MentionTextareaProps) {
  // ── Members cache ──
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);

  // ── Dropdown state ──
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Resolve members endpoint based on context ──
  const membersEndpoint = useMemo(() => {
    if (taskId) {
      return `/api/dashboard/tasks/${taskId}/members`;
    }
    if (projectId && variant === 'portal') {
      return `/api/portal/projects/${projectId}/members`;
    }
    if (projectId) {
      return `/api/dashboard/projects/${projectId}/members`;
    }
    return null;
  }, [projectId, taskId, variant]);

  // ── Variant-specific colors ──
  const accentColor = variant === 'portal' ? 'text-portal' : 'text-orange-500';
  const accentBg = variant === 'portal' ? 'bg-portal/10' : 'bg-orange-500/10';
  const accentBg20 = variant === 'portal' ? 'bg-portal/20' : 'bg-orange-500/20';

  // Reset members when context changes
  useEffect(() => {
    setMembers([]);
    setMembersLoaded(false);
    setMembersLoading(false);
  }, [membersEndpoint]);

  // ── Fetch members (lazy, once per endpoint) ──
  const fetchMembers = useCallback(async () => {
    if (membersLoaded || membersLoading || !membersEndpoint) return;
    setMembersLoading(true);
    try {
      const res = await fetch(membersEndpoint);
      const json = await res.json();
      if (res.ok && json.data) {
        setMembers(json.data as MemberItem[]);
      }
      setMembersLoaded(true);
    } catch {
      // silent — members won't be available for autocomplete
    } finally {
      setMembersLoading(false);
    }
  }, [membersEndpoint, membersLoaded, membersLoading]);

  // ── Filter members based on query ──
  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return members;
    const q = mentionQuery.toLowerCase();
    return members.filter((m) =>
      m.display_name.toLowerCase().includes(q)
    );
  }, [members, mentionQuery]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredMembers.length]);

  // ── Detect @ trigger on input change ──
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart;

    // Walk backwards from cursor to find the nearest @
    let atIndex = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      const ch = newValue[i];
      if (ch === ' ' || ch === '\n' || ch === '\r') break;
      if (ch === '@') {
        if (i === 0 || /[\s\n\r]/.test(newValue[i - 1])) {
          atIndex = i;
        }
        break;
      }
    }

    if (atIndex >= 0) {
      const query = newValue.slice(atIndex + 1, cursorPos);
      setMentionStartIndex(atIndex);
      setMentionQuery(query);
      setShowDropdown(true);

      // Lazy fetch members on first @ keystroke
      if (!membersLoaded && !membersLoading) {
        fetchMembers();
      }
    } else {
      setShowDropdown(false);
      setMentionQuery('');
    }
  };

  // ── Insert selected member ──
  const selectMember = useCallback(
    (member: MemberItem) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(cursorPos);
      const inserted = `@${member.display_name} `;
      const newValue = before + inserted + after;

      onChange(newValue);
      setShowDropdown(false);
      setMentionQuery('');

      requestAnimationFrame(() => {
        const newPos = mentionStartIndex + inserted.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      });
    },
    [value, mentionStartIndex, onChange]
  );

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectMember(filteredMembers[selectedIndex]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    // If dropdown is NOT active, pass to parent handler
    parentOnKeyDown?.(e);
  };

  // ── Close dropdown on outside click ──
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  // ── Scroll selected item into view ──
  useEffect(() => {
    if (!showDropdown || !dropdownRef.current) return;
    const items = dropdownRef.current.querySelectorAll('[data-mention-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, showDropdown]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className
        )}
        rows={rows}
        id={id}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
      />

      {/* Mention Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full mb-1 end-0 z-50 bg-popover border rounded-xl shadow-xl p-1.5 max-h-52 overflow-auto w-64 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {membersLoading ? (
            <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
              <Loader2 className={cn('h-3.5 w-3.5 animate-spin', accentColor)} />
              <span>جاري تحميل الأعضاء...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex items-center justify-center py-4 gap-2 text-xs text-muted-foreground">
              <AtSign className="h-3.5 w-3.5" />
              <span>لا يوجد أعضاء مطابقين</span>
            </div>
          ) : (
            <>
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                أعضاء الفريق
              </div>
              {filteredMembers.map((member, index) => (
                <button
                  key={member.username || member.display_name}
                  type="button"
                  data-mention-item
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMember(member);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'w-full text-start px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2',
                    index === selectedIndex
                      ? `${accentBg} ${accentColor}`
                      : 'hover:bg-muted'
                  )}
                >
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', accentBg20)}>
                    <span className={cn('text-[10px] font-bold', accentColor)}>
                      {member.display_name.charAt(0)}
                    </span>
                  </div>
                  <span className="truncate">@{member.display_name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

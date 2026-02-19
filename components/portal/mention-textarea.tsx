'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Loader2, AtSign } from 'lucide-react';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  projectId: string;
  placeholder?: string;
  className?: string;
  rows?: number;
  id?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
}

interface MemberItem {
  display_name: string;
}

/**
 * Textarea with @mention autocomplete for portal comments.
 *
 * When the user types `@`, fetches team members from the project's members
 * endpoint and shows a filtered dropdown. Keyboard navigation is supported.
 */
export function MentionTextarea({
  value,
  onChange,
  projectId,
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

  // ── Fetch members (lazy, once) ──
  const fetchMembers = useCallback(async () => {
    if (membersLoaded || membersLoading) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/members`);
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
  }, [projectId, membersLoaded, membersLoading]);

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
      // Stop at whitespace or newline → no active mention
      if (ch === ' ' || ch === '\n' || ch === '\r') break;
      if (ch === '@') {
        // Valid @ if it's at start or preceded by space/newline
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

      // Set cursor position after the inserted mention
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
    if (!showDropdown || filteredMembers.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredMembers.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Select the member — prevent form submission
      e.preventDefault();
      selectMember(filteredMembers[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
    }
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
          'flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
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
              <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
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
                  key={member.display_name}
                  type="button"
                  data-mention-item
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent textarea blur
                    selectMember(member);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'w-full text-start px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2',
                    index === selectedIndex
                      ? 'bg-orange-500/10 text-orange-600'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-orange-600">
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

'use client';

/**
 * Filter bar for the Pipeline view.
 *
 * State lives in the URL via useSearchParams so filters survive refresh and
 * are shareable. Submitting just calls router.replace() — useLeads picks up
 * the new params via its query key and refetches automatically.
 *
 * Mobile: collapses into a single search row + a "فلاتر" toggle that opens
 * the rest below it (handled by the wrapping page, not here).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PipelineFilterBarProps {
  /** Render owner-filter dropdown only for admins (sales agents see only their own leads). */
  isAdmin: boolean;
  /** Owner usernames the admin can choose from (derived from current leads). */
  ownerOptions?: string[];
  /** Total leads visible after current filters (rendered as a small live counter). */
  total?: number;
}

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'الموقع' },
  { value: 'referral', label: 'إحالة' },
  { value: 'manual', label: 'يدوي' },
  { value: 'ad', label: 'إعلان' },
  { value: 'social', label: 'سوشيال' },
];

const PRIORITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'urgent', label: 'عاجل' },
  { value: 'high', label: 'عالية' },
  { value: 'medium', label: 'عادية' },
  { value: 'low', label: 'منخفضة' },
];

export function PipelineFilterBar({ isAdmin, ownerOptions = [], total }: PipelineFilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();

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
    const t = setTimeout(() => {
      if (searchInput !== initialSearch) setParam('search', searchInput.trim() || null);
    }, 400);
    return () => clearTimeout(t);
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48 max-w-md">
        <Search className="absolute top-1/2 -translate-y-1/2 start-3 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="ابحث بالاسم أو الشركة أو الهاتف..."
          className="ps-9"
        />
      </div>

      {isAdmin && ownerOptions.length > 0 && (
        <Select value={owner} onValueChange={(v) => setParam('assigned_to', v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="المسؤول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المسؤولين</SelectItem>
            {ownerOptions.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={source} onValueChange={(v) => setParam('source', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="المصدر" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل المصادر</SelectItem>
          {SOURCE_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={priority} onValueChange={(v) => setParam('priority', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="الأولوية" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الأولويات</SelectItem>
          {PRIORITY_OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
          <X className="size-3.5" /> مسح ({activeCount})
        </Button>
      )}

      {typeof total === 'number' && (
        <span className="text-xs text-muted-foreground ms-auto tabular-nums">
          {total} {total === 1 ? 'صفقة' : 'صفقة'}
        </span>
      )}
    </div>
  );
}

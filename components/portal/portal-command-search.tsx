'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FileText, FolderKanban, Receipt, Loader2, X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SearchResult {
  id: string;
  name: string;
  type: 'file' | 'project' | 'quote';
  status?: string;
  project?: string;
  amount?: number;
}

interface SearchResults {
  files: SearchResult[];
  projects: SearchResult[];
  quotes: SearchResult[];
}

/* ------------------------------------------------------------------ */
/*  Status labels (Arabic)                                             */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  completed: 'مكتمل',
  on_hold: 'معلّق',
  cancelled: 'ملغي',
  sent: 'مرسل',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'منتهي',
  pending: 'قيد الانتظار',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PortalCommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Ctrl+K / Cmd+K shortcut ─────────────────────────────── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* ── Reset on close ──────────────────────────────────────── */
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  /* ── Debounced search ────────────────────────────────────── */
  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/search?q=${encodeURIComponent(term)}`);
      const json = await res.json();
      if (res.ok && json.data) setResults(json.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => search(query), 300);
    } else {
      setResults(null);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  /* ── Navigate on select ──────────────────────────────────── */
  function handleSelect(item: SearchResult) {
    setOpen(false);
    if (item.type === 'project') router.push(`/portal/projects/${item.id}`);
    else if (item.type === 'quote') router.push('/portal/quotes');
    else router.push('/portal/files');
  }

  /* ── Derived state ───────────────────────────────────────── */
  const hasResults =
    results &&
    (results.files.length > 0 ||
      results.projects.length > 0 ||
      results.quotes.length > 0);
  const noResults = results && !hasResults && query.length >= 2;

  /* ── Icon per type ───────────────────────────────────────── */
  function ResultIcon({ type }: { type: SearchResult['type'] }) {
    const cls = 'h-4 w-4 shrink-0';
    if (type === 'file') return <FileText className={`${cls} text-blue-500`} />;
    if (type === 'project') return <FolderKanban className={`${cls} text-orange-500`} />;
    return <Receipt className={`${cls} text-emerald-500`} />;
  }

  return (
    <>
      {/* ── Search trigger button (topbar) ─────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-9 rounded-lg border border-border/60 bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 min-w-[180px] lg:min-w-[240px]"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-start truncate">بحث...</span>
        <kbd className="pointer-events-none hidden select-none rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* Mobile search icon */}
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="بحث"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* ── Command palette overlay ────────────────────────── */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" dir="rtl">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Dialog */}
            <div className="flex items-start justify-center pt-[15vh] px-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="relative w-full max-w-[520px]"
              >
                <Command
                  label="بحث عام"
                  shouldFilter={false}
                  loop
                  className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl shadow-black/20 dark:shadow-black/40"
                >
                  {/* ── Input area ─────────────────────────── */}
                  <div className="flex items-center gap-2 border-b border-border/60 px-4">
                    {loading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-500" />
                    ) : (
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <Command.Input
                      value={query}
                      onValueChange={setQuery}
                      placeholder="ابحث في الملفات والمشاريع وعروض الأسعار..."
                      className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {query.length > 0 && (
                      <button
                        onClick={() => setQuery('')}
                        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        aria-label="مسح البحث"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setOpen(false)}
                      className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ESC
                    </button>
                  </div>

                  {/* ── Results list ───────────────────────── */}
                  <Command.List className="max-h-[320px] overflow-y-auto overscroll-contain p-2">
                    {/* Empty state */}
                    {noResults && !loading && (
                      <Command.Empty className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                        <Search className="h-8 w-8 mb-2 opacity-30" />
                        <span>لا توجد نتائج</span>
                      </Command.Empty>
                    )}

                    {/* Files group */}
                    {hasResults && results.files.length > 0 && (
                      <Command.Group
                        heading="الملفات"
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                      >
                        {results.files.map(item => (
                          <Command.Item
                            key={`file-${item.id}`}
                            value={`file-${item.id}-${item.name}`}
                            onSelect={() => handleSelect(item)}
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-orange-500/10 data-[selected=true]:text-foreground hover:bg-muted/60"
                          >
                            <ResultIcon type="file" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              {item.project && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {item.project}
                                </p>
                              )}
                            </div>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    {/* Projects group */}
                    {hasResults && results.projects.length > 0 && (
                      <Command.Group
                        heading="المشاريع"
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                      >
                        {results.projects.map(item => (
                          <Command.Item
                            key={`project-${item.id}`}
                            value={`project-${item.id}-${item.name}`}
                            onSelect={() => handleSelect(item)}
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-orange-500/10 data-[selected=true]:text-foreground hover:bg-muted/60"
                          >
                            <ResultIcon type="project" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              {item.status && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {STATUS_LABELS[item.status] || item.status}
                                </p>
                              )}
                            </div>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    {/* Quotes group */}
                    {hasResults && results.quotes.length > 0 && (
                      <Command.Group
                        heading="عروض الأسعار"
                        className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                      >
                        {results.quotes.map(item => (
                          <Command.Item
                            key={`quote-${item.id}`}
                            value={`quote-${item.id}-${item.name}`}
                            onSelect={() => handleSelect(item)}
                            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-orange-500/10 data-[selected=true]:text-foreground hover:bg-muted/60"
                          >
                            <ResultIcon type="quote" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{item.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.status
                                  ? STATUS_LABELS[item.status] || item.status
                                  : ''}
                                {item.amount != null && (
                                  <span>
                                    {item.status ? ' \u00B7 ' : ''}
                                    {item.amount.toLocaleString('ar-SA')} ر.س
                                  </span>
                                )}
                              </p>
                            </div>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}

                    {/* Initial hint (before any search) */}
                    {!results && !loading && query.length < 2 && (
                      <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
                        <Search className="h-8 w-8 mb-2 opacity-20" />
                        <span>اكتب للبحث في بوابتك</span>
                      </div>
                    )}
                  </Command.List>

                  {/* ── Footer ─────────────────────────────── */}
                  <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border/60 px-1 py-0.5 font-mono text-[10px]">
                          &uarr;&darr;
                        </kbd>
                        تنقل
                      </span>
                      <span className="flex items-center gap-1">
                        <kbd className="rounded border border-border/60 px-1 py-0.5 font-mono text-[10px]">
                          &crarr;
                        </kbd>
                        اختيار
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <kbd className="rounded border border-border/60 px-1 py-0.5 font-mono text-[10px]">
                        ESC
                      </kbd>
                      إغلاق
                    </span>
                  </div>
                </Command>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

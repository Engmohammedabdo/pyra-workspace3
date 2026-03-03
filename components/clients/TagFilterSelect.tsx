'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { Tag, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TagFilterSelectProps {
  value: string;
  onChange: (tagId: string) => void;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

const COLOR_DOT_CLASSES: Record<string, string> = {
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  gray: 'bg-gray-500',
};

export function TagFilterSelect({ value, onChange }: TagFilterSelectProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Fetch all tags on mount ───────────────────────
  useEffect(() => {
    async function fetchTags() {
      try {
        const res = await fetch('/api/clients/tags');
        const json = await res.json();
        if (json.data) {
          setTags(json.data);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchTags();
  }, []);

  // ── Click outside to close ────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // ── Get selected tag info ─────────────────────────
  const selectedTag = tags.find((t) => t.id === value);
  const displayLabel = selectedTag ? selectedTag.name : 'الكل';

  // Don't render if no tags exist and still loading
  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        التصنيفات
      </Button>
    );
  }

  // Don't render the filter if no tags exist at all
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'gap-1.5',
          value && 'border-orange-300 dark:border-orange-700'
        )}
      >
        <Tag className="h-3.5 w-3.5" />
        {selectedTag && (
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              COLOR_DOT_CLASSES[selectedTag.color] || 'bg-gray-500'
            )}
          />
        )}
        {displayLabel}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 end-0 z-50 w-56 rounded-xl border bg-popover shadow-lg py-1.5 overflow-hidden"
          >
            {/* "All" option */}
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-start',
                'hover:bg-muted/50',
                !value && 'bg-muted/70 font-medium'
              )}
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              الكل
            </button>

            {/* Divider */}
            <div className="border-t border-border my-1" />

            {/* Tag options */}
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  onChange(tag.id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-start',
                  'hover:bg-muted/50',
                  value === tag.id && 'bg-muted/70 font-medium'
                )}
              >
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full shrink-0',
                    COLOR_DOT_CLASSES[tag.color] || 'bg-gray-500'
                  )}
                />
                <span className="truncate">{tag.name}</span>
                {value === tag.id && (
                  <Badge
                    variant="secondary"
                    className="ms-auto text-[10px] px-1.5 py-0"
                  >
                    محدد
                  </Badge>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

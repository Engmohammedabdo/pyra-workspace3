'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Check, Loader2, Tag, Palette } from 'lucide-react';

interface ClientTagsManagerProps {
  clientId: string;
  initialTags?: TagItem[];
  onTagsChange?: (tags: TagItem[]) => void;
  readOnly?: boolean;
}

interface TagItem {
  id: string;
  name: string;
  color: string;
}

const TAG_COLORS: { name: string; value: string; bg: string; text: string }[] = [
  {
    name: 'orange',
    value: 'orange',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
  },
  {
    name: 'red',
    value: 'red',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
  },
  {
    name: 'green',
    value: 'green',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
  },
  {
    name: 'blue',
    value: 'blue',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
  },
  {
    name: 'purple',
    value: 'purple',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
  },
  {
    name: 'pink',
    value: 'pink',
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-700 dark:text-pink-400',
  },
  {
    name: 'teal',
    value: 'teal',
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-700 dark:text-teal-400',
  },
  {
    name: 'amber',
    value: 'amber',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
  },
  {
    name: 'gray',
    value: 'gray',
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-400',
  },
];

function getTagColorClasses(color: string) {
  return TAG_COLORS.find((c) => c.value === color) || TAG_COLORS[TAG_COLORS.length - 1];
}

export function ClientTagsManager({
  clientId,
  initialTags,
  onTagsChange,
  readOnly = false,
}: ClientTagsManagerProps) {
  const [assignedTags, setAssignedTags] = useState<TagItem[]>(initialTags || []);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // Popover state
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Search in popover
  const [searchQuery, setSearchQuery] = useState('');

  // Create new tag form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');
  const [creatingTag, setCreatingTag] = useState(false);

  // Updating assignments
  const [updatingTags, setUpdatingTags] = useState(false);

  // ── Sync initialTags prop ─────────────────────────
  useEffect(() => {
    if (initialTags) {
      setAssignedTags(initialTags);
    }
  }, [initialTags]);

  // ── Click outside to close ────────────────────────
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // ── Fetch all available tags when popover opens ───
  const fetchAllTags = useCallback(async () => {
    setLoadingAll(true);
    try {
      const res = await fetch('/api/clients/tags');
      const json = await res.json();
      if (json.data) {
        setAllTags(json.data);
      }
    } catch {
      toast.error('فشل في تحميل التصنيفات');
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAllTags();
    }
  }, [isOpen, fetchAllTags]);

  // ── Fetch assigned tags on mount (if no initialTags) ─
  const fetchAssignedTags = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/tags`);
      const json = await res.json();
      if (json.data) {
        setAssignedTags(json.data);
        onTagsChange?.(json.data);
      }
    } catch {
      // Silent fail for initial fetch
    }
  }, [clientId, onTagsChange]);

  useEffect(() => {
    if (!initialTags) {
      fetchAssignedTags();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Update tag assignments on server ──────────────
  const updateAssignments = async (newTags: TagItem[]) => {
    setUpdatingTags(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_ids: newTags.map((t) => t.id) }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        // Revert
        fetchAssignedTags();
        return;
      }
      const updated = json.data as TagItem[];
      setAssignedTags(updated);
      onTagsChange?.(updated);
    } catch {
      toast.error('فشل في تحديث التصنيفات');
      fetchAssignedTags();
    } finally {
      setUpdatingTags(false);
    }
  };

  // ── Toggle tag assignment ─────────────────────────
  const handleToggleTag = (tag: TagItem) => {
    const isAssigned = assignedTags.some((t) => t.id === tag.id);
    let newTags: TagItem[];
    if (isAssigned) {
      newTags = assignedTags.filter((t) => t.id !== tag.id);
    } else {
      newTags = [...assignedTags, tag];
    }
    // Optimistic update
    setAssignedTags(newTags);
    onTagsChange?.(newTags);
    updateAssignments(newTags);
  };

  // ── Remove tag from badge X click ─────────────────
  const handleRemoveTag = (tagId: string) => {
    const newTags = assignedTags.filter((t) => t.id !== tagId);
    // Optimistic update
    setAssignedTags(newTags);
    onTagsChange?.(newTags);
    updateAssignments(newTags);
  };

  // ── Create new tag ────────────────────────────────
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const res = await fetch('/api/clients/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      const createdTag = json.data as TagItem;
      // Add to allTags
      setAllTags((prev) => [...prev, createdTag]);
      // Auto-assign to client
      const newAssigned = [...assignedTags, createdTag];
      setAssignedTags(newAssigned);
      onTagsChange?.(newAssigned);
      updateAssignments(newAssigned);
      // Reset form
      setNewTagName('');
      setNewTagColor('blue');
      setShowCreateForm(false);
      toast.success('تم إنشاء التصنيف');
    } catch {
      toast.error('فشل في إنشاء التصنيف');
    } finally {
      setCreatingTag(false);
    }
  };

  // ── Filter tags by search ─────────────────────────
  const filteredTags = allTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Assigned tag badges */}
      <AnimatePresence initial={false}>
        {assignedTags.map((tag) => {
          const colorClasses = getTagColorClasses(tag.color);
          return (
            <motion.div
              key={tag.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              <Badge
                className={cn(
                  'gap-1 border-0 font-medium text-xs',
                  colorClasses.bg,
                  colorClasses.text
                )}
              >
                <Tag className="h-3 w-3" />
                {tag.name}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag.id)}
                    className={cn(
                      'ms-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
                      updatingTags && 'pointer-events-none opacity-50'
                    )}
                    disabled={updatingTags}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Add tag button + popover */}
      {!readOnly && (
        <div className="relative inline-block" ref={popoverRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="gap-1.5 h-7 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة تصنيف
          </Button>

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-2 end-0 z-50 w-72 rounded-xl border bg-popover shadow-lg p-3"
              >
                {/* Search input */}
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث عن تصنيف..."
                  className="h-8 text-sm mb-2"
                  autoFocus
                />

                {/* Tags list */}
                <div className="max-h-48 overflow-y-auto space-y-1 mb-2">
                  {loadingAll ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredTags.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {searchQuery ? 'لا توجد نتائج' : 'لا توجد تصنيفات'}
                    </p>
                  ) : (
                    filteredTags.map((tag) => {
                      const isAssigned = assignedTags.some((t) => t.id === tag.id);
                      const colorClasses = getTagColorClasses(tag.color);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          disabled={updatingTags}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors text-start',
                            'hover:bg-muted/50',
                            isAssigned && 'bg-muted/70'
                          )}
                        >
                          {/* Checkbox indicator */}
                          <div
                            className={cn(
                              'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                              isAssigned
                                ? 'bg-orange-500 border-orange-500'
                                : 'border-muted-foreground/30'
                            )}
                          >
                            {isAssigned && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>

                          {/* Color dot + name */}
                          <div
                            className={cn(
                              'h-2.5 w-2.5 rounded-full shrink-0',
                              colorClasses.bg
                            )}
                          />
                          <span className="truncate">{tag.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-border my-2" />

                {/* Create new tag section */}
                {!showCreateForm ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    إنشاء تصنيف جديد
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="overflow-hidden space-y-2"
                  >
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="اسم التصنيف..."
                      className="h-8 text-sm"
                      autoFocus
                    />

                    {/* Color picker */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Palette className="h-3 w-3" />
                        اللون
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {TAG_COLORS.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            onClick={() => setNewTagColor(color.value)}
                            className={cn(
                              'h-6 w-6 rounded-full border-2 transition-all',
                              color.bg,
                              newTagColor === color.value
                                ? 'border-foreground scale-110'
                                : 'border-transparent hover:scale-105'
                            )}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Create buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleCreateTag}
                        disabled={creatingTag || !newTagName.trim()}
                        className="gap-1 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        {creatingTag ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        إنشاء
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewTagName('');
                          setNewTagColor('blue');
                        }}
                        className="h-7 text-xs"
                        disabled={creatingTag}
                      >
                        إلغاء
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

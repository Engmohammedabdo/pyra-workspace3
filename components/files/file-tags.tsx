'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tags, X, Plus } from 'lucide-react';
import { useFileTags, useAllTags, useAddTag, useRemoveTag } from '@/hooks/useFileTags';

const TAG_COLORS = [
  { value: '#f97316', label: 'برتقالي' },
  { value: '#ef4444', label: 'أحمر' },
  { value: '#22c55e', label: 'أخضر' },
  { value: '#3b82f6', label: 'أزرق' },
  { value: '#8b5cf6', label: 'بنفسجي' },
  { value: '#ec4899', label: 'وردي' },
  { value: '#14b8a6', label: 'فيروزي' },
  { value: '#f59e0b', label: 'ذهبي' },
  { value: '#6b7280', label: 'رمادي' },
];

interface FileTagsPopoverProps {
  filePath: string;
  /** If true, renders the tag editor content directly (no popover wrapper) */
  embedded?: boolean;
}

function TagEditorContent({
  filePath,
}: {
  filePath: string;
}) {
  const { data: tags = [] } = useFileTags(filePath);
  const { data: allTags = [] } = useAllTags();
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#f97316');

  const handleAddTag = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    addTag.mutate({ filePath, tagName: trimmed, color: selectedColor });
    setNewTagName('');
  };

  const handleAddExisting = (tagName: string, color: string) => {
    if (tags.some((t) => t.tag_name === tagName)) return;
    addTag.mutate({ filePath, tagName, color });
  };

  const handleRemove = (tagName: string) => {
    removeTag.mutate({ filePath, tagName });
  };

  const suggestions = allTags.filter(
    (t) => !tags.some((existing) => existing.tag_name === t.tag_name)
  );

  return (
    <div className="space-y-3 p-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Tags className="h-4 w-4" /> وسوم الملف
      </h4>

      {/* Current tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge
              key={tag.id}
              style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
              className="gap-1 text-[11px] pe-1"
            >
              {tag.tag_name}
              <button
                onClick={() => handleRemove(tag.tag_name)}
                className="hover:bg-black/10 rounded-full p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Add new tag */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag();
            }}
            placeholder="وسم جديد..."
            maxLength={30}
            className="flex-1 px-2 py-1.5 rounded-md text-xs border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={handleAddTag}
            disabled={!newTagName.trim() || addTag.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setSelectedColor(c.value)}
              className={`w-5 h-5 rounded-full transition-all ${
                selectedColor === c.value
                  ? 'ring-2 ring-offset-1 ring-offset-background'
                  : 'hover:scale-110'
              }`}
              style={
                {
                  backgroundColor: c.value,
                  '--tw-ring-color': c.value,
                } as React.CSSProperties
              }
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">وسوم موجودة:</p>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 10).map((s) => (
              <button
                key={s.tag_name}
                onClick={() => handleAddExisting(s.tag_name, s.color)}
                className="text-[10px] px-2 py-0.5 rounded-full border hover:bg-accent transition-colors"
                style={{ borderColor: `${s.color}40`, color: s.color }}
              >
                + {s.tag_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FileTagsPopover({ filePath, embedded }: FileTagsPopoverProps) {
  const { data: tags = [] } = useFileTags(filePath);
  const [open, setOpen] = useState(false);

  // Embedded mode: render content directly without popover
  if (embedded) {
    return <TagEditorContent filePath={filePath} />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
          <Tags className="h-3.5 w-3.5" />
          {tags.length > 0 && (
            <span className="text-xs font-mono">{tags.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <TagEditorContent filePath={filePath} />
      </PopoverContent>
    </Popover>
  );
}

// ── Inline tag display (for grid/list views) ──
export function FileTagsBadges({ filePath }: { filePath: string }) {
  const { data: tags = [] } = useFileTags(filePath);

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          className="text-[9px] px-1.5 py-0 rounded-full"
          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
        >
          {tag.tag_name}
        </span>
      ))}
      {tags.length > 3 && (
        <span className="text-[9px] text-muted-foreground">+{tags.length - 3}</span>
      )}
    </div>
  );
}

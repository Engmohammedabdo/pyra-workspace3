'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { motion, AnimatePresence } from 'framer-motion';
import {
  StickyNote,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Loader2,
} from 'lucide-react';

interface ClientNotesTabProps {
  clientId: string;
}

interface Note {
  id: string;
  client_id: string;
  content: string;
  is_pinned: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function ClientNotesTab({ clientId }: ClientNotesTabProps) {
  const canEdit = usePermission('clients.edit');

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // Add note form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Edit note state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pin toggling
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);

  // ── Fetch notes ───────────────────────────────────
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`);
      const json = await res.json();
      if (json.data) {
        setNotes(json.data);
      }
    } catch {
      toast.error('فشل في تحميل الملاحظات');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // ── Add note ──────────────────────────────────────
  const handleAddNote = async () => {
    if (!newContent.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      // Optimistic: add to top (after pinned notes)
      setNotes((prev) => {
        const pinned = prev.filter((n) => n.is_pinned);
        const unpinned = prev.filter((n) => !n.is_pinned);
        return [...pinned, json.data, ...unpinned];
      });
      setNewContent('');
      setShowAddForm(false);
      toast.success('تمت إضافة الملاحظة');
    } catch {
      toast.error('فشل في إضافة الملاحظة');
    } finally {
      setAddingNote(false);
    }
  };

  // ── Edit note ─────────────────────────────────────
  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!editContent.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      // Optimistic update
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, content: editContent.trim(), updated_at: new Date().toISOString() }
            : n
        )
      );
      setEditingNoteId(null);
      setEditContent('');
      toast.success('تم تحديث الملاحظة');
    } catch {
      toast.error('فشل في تحديث الملاحظة');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Toggle pin ────────────────────────────────────
  const handleTogglePin = async (note: Note) => {
    setTogglingPinId(note.id);
    const newPinned = !note.is_pinned;

    // Optimistic update
    setNotes((prev) => {
      const updated = prev.map((n) =>
        n.id === note.id ? { ...n, is_pinned: newPinned } : n
      );
      // Re-sort: pinned first, then by date desc
      return updated.sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });

    try {
      const res = await fetch(`/api/clients/${clientId}/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: newPinned }),
      });
      const json = await res.json();
      if (json.error) {
        // Revert on error
        setNotes((prev) => {
          const reverted = prev.map((n) =>
            n.id === note.id ? { ...n, is_pinned: !newPinned } : n
          );
          return reverted.sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        });
        toast.error(json.error);
        return;
      }
      toast.success(newPinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت');
    } catch {
      toast.error('فشل في تحديث الملاحظة');
    } finally {
      setTogglingPinId(null);
    }
  };

  // ── Delete note ───────────────────────────────────
  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setConfirmDeleteId(null);
      toast.success('تم حذف الملاحظة');
    } catch {
      toast.error('فشل في حذف الملاحظة');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Loading skeleton ──────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-16 w-0.5 mt-1" />
            </div>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add note button */}
      {canEdit && !showAddForm && (
        <Button
          onClick={() => setShowAddForm(true)}
          size="sm"
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          إضافة ملاحظة
        </Button>
      )}

      {/* Add note inline form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-4 border-orange-200 dark:border-orange-800/40">
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="اكتب ملاحظتك هنا..."
                className="min-h-[80px] resize-none mb-3"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={addingNote || !newContent.trim()}
                  className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {addingNote ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  حفظ
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewContent('');
                  }}
                  disabled={addingNote}
                >
                  <X className="h-3.5 w-3.5 me-1" />
                  إلغاء
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {notes.length === 0 && !showAddForm && (
        <EmptyState
          icon={StickyNote}
          title="لا توجد ملاحظات"
          description="أضف ملاحظات لتوثيق المحادثات والقرارات المهمة"
          actionLabel={canEdit ? 'إضافة ملاحظة' : undefined}
          onAction={canEdit ? () => setShowAddForm(true) : undefined}
        />
      )}

      {/* Notes timeline */}
      {notes.length > 0 && (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute top-2 bottom-2 end-[11px] w-0.5 bg-border" />

          <AnimatePresence initial={false}>
            {notes.map((note, index) => (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ delay: index * 0.03 }}
                className="relative flex gap-4 mb-4 last:mb-0"
              >
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <Card
                    className={cn(
                      'p-4 transition-colors group',
                      note.is_pinned &&
                        'border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/10'
                    )}
                  >
                    {/* Pinned indicator */}
                    {note.is_pinned && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pin className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                          مثبّتة
                        </span>
                      </div>
                    )}

                    {/* Note content or edit form */}
                    {editingNoteId === note.id ? (
                      <div>
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="min-h-[60px] resize-none mb-3"
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(note.id)}
                            disabled={savingEdit || !editContent.trim()}
                            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
                          >
                            {savingEdit ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            حفظ
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEditing}
                            disabled={savingEdit}
                          >
                            <X className="h-3.5 w-3.5 me-1" />
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                        {note.content}
                      </p>
                    )}

                    {/* Footer: meta + actions */}
                    {editingNoteId !== note.id && (
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">
                          بواسطة{' '}
                          <span className="font-medium">{note.created_by}</span>{' '}
                          · {formatRelativeDate(note.created_at)}
                        </span>

                        {/* Action buttons */}
                        {canEdit && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                            {/* Edit */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => startEditing(note)}
                              title="تعديل"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>

                            {/* Pin / Unpin */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-7 w-7',
                                note.is_pinned
                                  ? 'text-orange-500 hover:text-orange-600'
                                  : 'text-muted-foreground hover:text-foreground'
                              )}
                              onClick={() => handleTogglePin(note)}
                              disabled={togglingPinId === note.id}
                              title={note.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'}
                            >
                              {togglingPinId === note.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : note.is_pinned ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </Button>

                            {/* Delete */}
                            {confirmDeleteId === note.id ? (
                              <div className="flex items-center gap-1 ms-1">
                                <span className="text-xs text-destructive font-medium">
                                  حذف؟
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(note.id)}
                                  disabled={deletingId === note.id}
                                >
                                  {deletingId === note.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deletingId === note.id}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setConfirmDeleteId(note.id)}
                                title="حذف"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                </div>

                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-5 shrink-0">
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full border-2 z-10',
                      note.is_pinned
                        ? 'bg-orange-500 border-orange-500'
                        : 'bg-background border-muted-foreground/40'
                    )}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

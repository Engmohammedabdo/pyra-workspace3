'use client';

/**
 * Phase 15.1 Commit 3 — Lead Tasks tab.
 *
 * Structure (top-to-bottom):
 *   1. "+ إضافة مهمة" expand button (collapsed by default)
 *   2. Expanded inline create form (title required, due_date optional,
 *      priority dropdown default 'medium', assignee combobox)
 *   3. Task list (rendered as <LeadTaskRow> components — see file for
 *      inline-edit + kebab semantics)
 *   4. Edit Sheet (slides from inline-end; opens via kebab "تعديل التفاصيل")
 *   5. Delete AlertDialog (opens via kebab "حذف")
 *
 * Empty state: <EmptyState> with ClipboardList icon. NO CTA (form is at
 * the top of the tab, always accessible).
 *
 * Data: useLeadTasks(leadId) — staleTime 30s. Mutations invalidate the
 * tasks key + activities key + my-tasks aggregator.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ClipboardList, Plus, Loader2, Check, X,
} from 'lucide-react';
import {
  useLeadTasks,
  useCreateLeadTask,
  useUpdateLeadTask,
  useDeleteLeadTask,
} from '@/hooks/useLeadTasks';
import { LeadTaskRow } from './lead-task-row';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import {
  LEAD_TASK_STATUS,
  LEAD_TASK_PRIORITY,
  LEAD_TASK_TITLE_MAX,
} from '@/lib/constants/statuses';
import type {
  PyraLeadTask,
  LeadTaskPriority,
  LeadTaskStatus,
} from '@/types/database';

// ── Sub-types ──

interface CreateFormState {
  title: string;
  due_date: string;
  priority: LeadTaskPriority;
  // Note: assigned_to defaults to the actor (server-side); v1 form doesn't
  // expose a combobox per Q3-2 inline-edit-scope lock (assignee changes go
  // through the kebab → Edit Sheet path). Keeps the create form compact.
}

interface EditFormState {
  title: string;
  description: string;
  due_date: string;
  priority: LeadTaskPriority | 'none';
  status: LeadTaskStatus;
}

// ── Component ──

export function LeadTasksTab({ leadId }: { leadId: string }) {
  const t = useTranslations('crm.leadTabs.tasks');
  const statusLabelFor = useStatusLabels('leadTask');
  const priorityLabelFor = useStatusLabels('leadTaskPriority');
  const { data, isLoading } = useLeadTasks(leadId);
  const createMutation = useCreateLeadTask();
  const updateMutation = useUpdateLeadTask();
  const deleteMutation = useDeleteLeadTask();

  const tasks = useMemo(() => data?.tasks ?? [], [data?.tasks]);

  // ── Create form state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    title: '',
    due_date: '',
    priority: 'medium',
  });

  function resetCreate() {
    setCreateForm({ title: '', due_date: '', priority: 'medium' });
  }

  async function handleCreate() {
    const title = createForm.title.trim();
    if (!title) {
      toast.error(t('requiredTitle'));
      return;
    }
    if (title.length > LEAD_TASK_TITLE_MAX) {
      toast.error(t('titleTooLong', { max: LEAD_TASK_TITLE_MAX }));
      return;
    }
    try {
      await createMutation.mutateAsync({
        lead_id: leadId,
        title,
        due_date: createForm.due_date || null,
        priority: createForm.priority,
      });
      resetCreate();
      setCreateOpen(false);
      toast.success(t('createSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('createError'));
    }
  }

  // ── Edit Sheet state ──
  const [editingTask, setEditingTask] = useState<PyraLeadTask | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    status: 'pending',
  });

  function openEditSheet(task: PyraLeadTask) {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description ?? '',
      due_date: task.due_date ?? '',
      priority: task.priority ?? 'none',
      status: task.status,
    });
  }

  function closeEditSheet() {
    setEditingTask(null);
  }

  async function handleEditSave() {
    if (!editingTask) return;
    const title = editForm.title.trim();
    if (!title) {
      toast.error(t('requiredTitle'));
      return;
    }
    if (title.length > LEAD_TASK_TITLE_MAX) {
      toast.error(t('titleTooLong', { max: LEAD_TASK_TITLE_MAX }));
      return;
    }
    try {
      await updateMutation.mutateAsync({
        lead_id: leadId,
        task_id: editingTask.id,
        title,
        description: editForm.description.trim() || null,
        due_date: editForm.due_date || null,
        priority: editForm.priority === 'none' ? null : editForm.priority,
        status: editForm.status,
      });
      toast.success(t('updateSuccess'));
      closeEditSheet();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateError'));
    }
  }

  // ── Delete AlertDialog state ──
  const [deletingTask, setDeletingTask] = useState<PyraLeadTask | null>(null);

  async function handleDelete() {
    if (!deletingTask) return;
    try {
      await deleteMutation.mutateAsync({
        lead_id: leadId,
        task_id: deletingTask.id,
      });
      toast.success(t('deleteSuccess'));
      setDeletingTask(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteError'));
    }
  }

  // ── Render ──
  return (
    <div className="space-y-3">
      {/* Add Form */}
      {!createOpen ? (
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white justify-start"
          aria-label={t('addAria')}
        >
          <Plus className="size-4 me-2" aria-hidden />
          {t('add')}
        </Button>
      ) : (
        <div className="space-y-3 p-3 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-500/[0.03]">
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-xs">{t('titleField')}</Label>
            <Input
              id="task-title"
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('titlePlaceholder')}
              className="h-11"
              maxLength={LEAD_TASK_TITLE_MAX}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !createMutation.isPending) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due" className="text-xs">{t('dueDateField')}</Label>
              <Input
                id="task-due"
                type="date"
                value={createForm.due_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority" className="text-xs">{t('priorityField')}</Label>
              <Select
                value={createForm.priority}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, priority: v as LeadTaskPriority }))}
              >
                <SelectTrigger id="task-priority" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(LEAD_TASK_PRIORITY).map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabelFor(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                resetCreate();
                setCreateOpen(false);
              }}
              disabled={createMutation.isPending}
              className="h-11"
            >
              <X className="size-4 me-1.5" aria-hidden />
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreate()}
              disabled={createMutation.isPending || !createForm.title.trim()}
              className="h-11 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 me-1.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4 me-1.5" aria-hidden />
              )}
              {t('confirmAdd')}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <LeadTaskRow
              key={task.id}
              task={task}
              onEdit={() => openEditSheet(task)}
              onDelete={() => setDeletingTask(task)}
            />
          ))}
        </div>
      )}

      {/* Edit Sheet */}
      <Sheet open={!!editingTask} onOpenChange={(o) => { if (!o) closeEditSheet(); }}>
        <SheetContent side="right" className="w-[95vw] sm:max-w-md overflow-y-auto p-4">
          <SheetHeader className="pb-4">
            <SheetTitle>{t('editSheetTitle')}</SheetTitle>
            <SheetDescription>
              {t('editSheetDescription')}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title" className="text-xs">{t('titleField')}</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="h-11"
                maxLength={LEAD_TASK_TITLE_MAX}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs">{t('descriptionField')}</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder={t('descriptionPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-due" className="text-xs">{t('dueDateField')}</Label>
                <Input
                  id="edit-due"
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-priority" className="text-xs">{t('priorityField')}</Label>
                <Select
                  value={editForm.priority}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v as LeadTaskPriority | 'none' }))}
                >
                  <SelectTrigger id="edit-priority" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('priorityNone')}</SelectItem>
                    {Object.values(LEAD_TASK_PRIORITY).map((p) => (
                      <SelectItem key={p} value={p}>
                        {priorityLabelFor(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-status" className="text-xs">{t('statusField')}</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as LeadTaskStatus }))}
              >
                <SelectTrigger id="edit-status" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(LEAD_TASK_STATUS).map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabelFor(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="flex flex-row items-center justify-end gap-2 pt-4 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={closeEditSheet}
              disabled={updateMutation.isPending}
              className="h-11"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleEditSave()}
              disabled={updateMutation.isPending || !editForm.title.trim()}
              className="h-11 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {updateMutation.isPending ? (
                <Loader2 className="size-4 me-1.5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4 me-1.5" aria-hidden />
              )}
              {t('save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!deletingTask}
        onOpenChange={(o) => { if (!o) setDeletingTask(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { title: deletingTask?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // AlertDialogAction closes on click by default; we still want
                // to await the mutation before closing, so override the
                // default behavior with explicit handler that triggers the
                // mutation. The Dialog stays mounted via open={!!deletingTask};
                // setDeletingTask(null) on success closes it.
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 me-1.5 animate-spin" aria-hidden />
              ) : null}
              {t('confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

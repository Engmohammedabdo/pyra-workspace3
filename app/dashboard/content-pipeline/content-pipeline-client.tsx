'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  Plus,
  Film,
  Loader2,
  Calendar,
  User,
  CheckCircle2,
  Circle,
  PlayCircle,
  SkipForward,
  Clock,
  AlertCircle,
  Clapperboard,
  FileText,
  Mic,
  Share2,
  PenLine,
  Eye,
  Truck,
  Scissors,
  RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────
interface PipelineStage {
  id: string;
  stage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  sort_order: number;
}

interface PipelineItem {
  id: string;
  project_id: string | null;
  title: string;
  content_type: string;
  current_stage: string;
  assigned_to: string | null;
  assigned_display_name: string | null;
  script_review_id: string | null;
  deadline: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  project_name: string | null;
  pyra_pipeline_stages: PipelineStage[];
}

interface ProjectOption {
  id: string;
  name: string;
}

interface UserOption {
  username: string;
  display_name: string;
}

// ─── Constants ────────────────────────────────────────
const STAGE_ORDER = [
  'scripting',
  'review',
  'revision',
  'filming',
  'editing',
  'client_review',
  'delivery',
] as const;

const STAGE_LABELS: Record<string, string> = {
  scripting: 'كتابة السكريبت',
  review: 'المراجعة',
  revision: 'التعديل',
  filming: 'التصوير',
  editing: 'المونتاج',
  client_review: 'مراجعة العميل',
  delivery: 'التسليم',
};

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  scripting: PenLine,
  review: Eye,
  revision: RefreshCw,
  filming: Clapperboard,
  editing: Scissors,
  client_review: User,
  delivery: Truck,
};

const STAGE_COLORS: Record<string, string> = {
  scripting: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  review: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  revision: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
  filming: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
  editing: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800',
  client_review: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800',
  delivery: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  video: { label: 'فيديو', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' },
  reel: { label: 'ريلز', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300' },
  podcast: { label: 'بودكاست', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' },
  article: { label: 'مقال', color: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' },
  social_post: { label: 'منشور', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Film,
  reel: Share2,
  podcast: Mic,
  article: FileText,
  social_post: Share2,
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  pending: { label: 'معلّق', icon: Circle, color: 'text-muted-foreground' },
  in_progress: { label: 'قيد التنفيذ', icon: PlayCircle, color: 'text-orange-500' },
  completed: { label: 'مكتمل', icon: CheckCircle2, color: 'text-green-500' },
  skipped: { label: 'تم تخطيه', icon: SkipForward, color: 'text-muted-foreground' },
};

// ─── Helper functions ─────────────────────────────────
function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date(new Date().toDateString());
}

function getCompletedCount(stages: PipelineStage[]): number {
  return stages.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
}

// ─── Main Component ───────────────────────────────────
export default function ContentPipelineClient() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('video');
  const [newProject, setNewProject] = useState('');
  const [newAssigned, setNewAssigned] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Detail dialog
  const [selectedItem, setSelectedItem] = useState<PipelineItem | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Fetch pipeline items ───────────────────────────
  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('content_type', filterType);
      if (filterProject !== 'all') params.set('project_id', filterProject);

      const res = await fetch(`/api/dashboard/content-pipeline?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterType, filterProject]);

  // ─── Fetch projects and users for dropdowns ─────────
  const fetchDropdownData = useCallback(async () => {
    try {
      const [projRes, userRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/directory'),
      ]);
      if (projRes.ok) {
        const projJson = await projRes.json();
        setProjects((projJson.data || []).map((p: { id: string; name: string }) => ({
          id: p.id,
          name: p.name,
        })));
      }
      if (userRes.ok) {
        const userJson = await userRes.json();
        setUsers((userJson.data || []).map((u: { username: string; display_name: string }) => ({
          username: u.username,
          display_name: u.display_name,
        })));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchDropdownData();
  }, [fetchDropdownData]);

  // ─── Create pipeline item ───────────────────────────
  const handleCreate = async () => {
    if (!newTitle.trim()) {
      toast.error('عنوان المحتوى مطلوب');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/dashboard/content-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          content_type: newType,
          project_id: newProject || null,
          assigned_to: newAssigned || null,
          deadline: newDeadline || null,
          notes: newNotes || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'فشل');
      }
      toast.success('تم إنشاء المحتوى بنجاح');
      setShowCreate(false);
      resetCreateForm();
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إنشاء المحتوى');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewTitle('');
    setNewType('video');
    setNewProject('');
    setNewAssigned('');
    setNewDeadline('');
    setNewNotes('');
  };

  // ─── Stage actions ──────────────────────────────────
  const handleStageAction = async (
    pipelineId: string,
    stageId: string,
    action: 'start' | 'complete' | 'skip'
  ) => {
    setActionLoading(stageId);
    try {
      const res = await fetch(`/api/dashboard/content-pipeline/${pipelineId}/stages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: stageId, action }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'فشل');
      }
      const json = await res.json();
      const updatedPipeline = json.data;

      // Update selectedItem in-place
      if (selectedItem && updatedPipeline) {
        setSelectedItem({
          ...selectedItem,
          current_stage: updatedPipeline.current_stage,
          pyra_pipeline_stages: updatedPipeline.pyra_pipeline_stages || [],
        });
      }

      const actionLabels = { start: 'بدء', complete: 'إكمال', skip: 'تخطي' };
      toast.success(`تم ${actionLabels[action]} المرحلة بنجاح`);
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل تحديث المرحلة');
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Open detail dialog ─────────────────────────────
  const openDetail = (item: PipelineItem) => {
    setSelectedItem(item);
    setShowDetail(true);
  };

  // ─── Group items by current_stage ───────────────────
  const grouped: Record<string, PipelineItem[]> = {};
  STAGE_ORDER.forEach((stage) => {
    grouped[stage] = [];
  });
  items.forEach((item) => {
    if (grouped[item.current_stage]) {
      grouped[item.current_stage].push(item);
    } else {
      // Fallback: put in scripting if unknown stage
      grouped['scripting'].push(item);
    }
  });

  // ─── Loading state ──────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="min-w-[280px] space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">خط إنتاج المحتوى</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filter by type */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="نوع المحتوى" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filter by project */}
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="المشروع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المشاريع</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => setShowCreate(true)}
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4" />
            إنشاء محتوى جديد
          </Button>
        </div>
      </div>

      {/* ─── Kanban Board ────────────────────────────── */}
      {items.length === 0 ? (
        <EmptyState
          icon={Film}
          title="لا يوجد محتوى في خط الإنتاج"
          description="أنشئ أول محتوى لبدء تتبع مراحل الإنتاج"
          actionLabel="إنشاء محتوى جديد"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" dir="rtl">
          {STAGE_ORDER.map((stage) => {
            const StageIcon = STAGE_ICONS[stage];
            const stageItems = grouped[stage];
            return (
              <div
                key={stage}
                className={cn(
                  'min-w-[280px] max-w-[320px] flex-shrink-0 rounded-xl border p-3',
                  STAGE_COLORS[stage]
                )}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <StageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">
                    {stageItems.length}
                  </Badge>
                </div>

                {/* Cards */}
                <div className="space-y-2.5">
                  {stageItems.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      لا يوجد عناصر
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <PipelineCard
                        key={item.id}
                        item={item}
                        onClick={() => openDetail(item)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create Dialog ───────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء محتوى جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العنوان *</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="عنوان المحتوى"
                className="mt-1"
              />
            </div>
            <div>
              <Label>نوع المحتوى</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المشروع</Label>
              <Select value={newProject} onValueChange={setNewProject}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مشروع</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المسؤول</Label>
              <Select value={newAssigned} onValueChange={setNewAssigned}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير محدد</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الموعد النهائي</Label>
              <Input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                إلغاء
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin me-1.5" />}
                إنشاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ───────────────────────────── */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg">{selectedItem.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Meta info */}
                <div className="flex flex-wrap gap-2 items-center">
                  <ContentTypeBadge type={selectedItem.content_type} />
                  {selectedItem.project_name && (
                    <Badge variant="outline" className="text-xs">
                      {selectedItem.project_name}
                    </Badge>
                  )}
                  {selectedItem.assigned_display_name && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {selectedItem.assigned_display_name}
                    </div>
                  )}
                  {selectedItem.deadline && (
                    <div
                      className={cn(
                        'flex items-center gap-1 text-xs',
                        isOverdue(selectedItem.deadline)
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {formatDate(selectedItem.deadline)}
                    </div>
                  )}
                </div>

                {selectedItem.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    {selectedItem.notes}
                  </p>
                )}

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>التقدم</span>
                    <span>
                      {getCompletedCount(selectedItem.pyra_pipeline_stages)}/
                      {selectedItem.pyra_pipeline_stages.length}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${
                          (getCompletedCount(selectedItem.pyra_pipeline_stages) /
                            selectedItem.pyra_pipeline_stages.length) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stages timeline */}
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    مراحل الإنتاج
                  </h3>
                  <div className="space-y-0">
                    {selectedItem.pyra_pipeline_stages.map((stage, idx) => {
                      const config = STATUS_CONFIG[stage.status];
                      const StageIcon = STAGE_ICONS[stage.stage];
                      const StatusIcon = config.icon;
                      const isLast = idx === selectedItem.pyra_pipeline_stages.length - 1;

                      return (
                        <div key={stage.id} className="flex gap-3">
                          {/* Timeline line */}
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'w-8 h-8 rounded-full flex items-center justify-center border-2 flex-shrink-0',
                                stage.status === 'completed'
                                  ? 'bg-green-100 border-green-500 dark:bg-green-900/50'
                                  : stage.status === 'in_progress'
                                  ? 'bg-orange-100 border-orange-500 dark:bg-orange-900/50'
                                  : stage.status === 'skipped'
                                  ? 'bg-muted border-muted-foreground/30'
                                  : 'bg-muted border-muted-foreground/20'
                              )}
                            >
                              <StatusIcon
                                className={cn('h-4 w-4', config.color)}
                              />
                            </div>
                            {!isLast && (
                              <div
                                className={cn(
                                  'w-0.5 h-full min-h-[32px]',
                                  stage.status === 'completed'
                                    ? 'bg-green-300 dark:bg-green-700'
                                    : 'bg-muted-foreground/20'
                                )}
                              />
                            )}
                          </div>

                          {/* Stage content */}
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <StageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground">
                                  {STAGE_LABELS[stage.stage]}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={cn('text-[10px] px-1.5 py-0', config.color)}
                                >
                                  {config.label}
                                </Badge>
                              </div>
                            </div>

                            {/* Timestamps */}
                            {(stage.started_at || stage.completed_at) && (
                              <div className="flex gap-3 mt-1 text-[11px] text-muted-foreground">
                                {stage.started_at && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    بدأ: {formatDate(stage.started_at, 'dd/MM HH:mm')}
                                  </span>
                                )}
                                {stage.completed_at && (
                                  <span className="flex items-center gap-0.5">
                                    <CheckCircle2 className="h-3 w-3" />
                                    اكتمل: {formatDate(stage.completed_at, 'dd/MM HH:mm')}
                                  </span>
                                )}
                              </div>
                            )}

                            {stage.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {stage.notes}
                              </p>
                            )}

                            {/* Action buttons */}
                            <div className="flex gap-1.5 mt-2">
                              {stage.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1"
                                  disabled={actionLoading === stage.id}
                                  onClick={() =>
                                    handleStageAction(selectedItem.id, stage.id, 'start')
                                  }
                                >
                                  {actionLoading === stage.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <PlayCircle className="h-3 w-3" />
                                  )}
                                  بدء
                                </Button>
                              )}
                              {stage.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                                  disabled={actionLoading === stage.id}
                                  onClick={() =>
                                    handleStageAction(selectedItem.id, stage.id, 'complete')
                                  }
                                >
                                  {actionLoading === stage.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                  إكمال
                                </Button>
                              )}
                              {(stage.status === 'pending' ||
                                stage.status === 'in_progress') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs gap-1 text-muted-foreground"
                                  disabled={actionLoading === stage.id}
                                  onClick={() =>
                                    handleStageAction(selectedItem.id, stage.id, 'skip')
                                  }
                                >
                                  {actionLoading === stage.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <SkipForward className="h-3 w-3" />
                                  )}
                                  تخطي
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Pipeline Card Component ──────────────────────────
function PipelineCard({
  item,
  onClick,
}: {
  item: PipelineItem;
  onClick: () => void;
}) {
  const completed = getCompletedCount(item.pyra_pipeline_stages);
  const total = item.pyra_pipeline_stages.length;
  const TypeIcon = TYPE_ICONS[item.content_type] || Film;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border bg-card"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Title */}
        <p className="text-sm font-medium text-foreground line-clamp-2 leading-relaxed">
          {item.title}
        </p>

        {/* Type badge + Project */}
        <div className="flex items-center gap-2 flex-wrap">
          <ContentTypeBadge type={item.content_type} />
          {item.project_name && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
              {item.project_name}
            </span>
          )}
        </div>

        {/* Bottom row: assigned + deadline + progress */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            {item.assigned_display_name && (
              <span className="flex items-center gap-0.5">
                <User className="h-3 w-3" />
                {item.assigned_display_name}
              </span>
            )}
            {item.deadline && (
              <span
                className={cn(
                  'flex items-center gap-0.5',
                  isOverdue(item.deadline) && 'text-red-500 font-medium'
                )}
              >
                {isOverdue(item.deadline) ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <Calendar className="h-3 w-3" />
                )}
                {formatDate(item.deadline)}
              </span>
            )}
          </div>
          <span className="flex items-center gap-0.5 font-medium">
            {completed}/{total}
          </span>
        </div>

        {/* Mini progress bar */}
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-300"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Content Type Badge ───────────────────────────────
function ContentTypeBadge({ type }: { type: string }) {
  const config = TYPE_LABELS[type] || TYPE_LABELS.video;
  const TypeIcon = TYPE_ICONS[type] || Film;
  return (
    <Badge className={cn('text-[10px] gap-1 border-0 px-2 py-0.5', config.color)}>
      <TypeIcon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

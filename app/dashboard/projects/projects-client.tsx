'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { usePermission } from '@/hooks/usePermission';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Briefcase, Plus, MoreHorizontal, Pencil, Trash2, FileText, MessageSquare, CheckCircle, Clock, AlertTriangle, HardDrive, LayoutGrid, Table2, Eye, CalendarDays } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { formatDate, formatFileSize } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ProjectKanban } from '@/components/projects/project-kanban';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type ColumnDef, type SortConfig } from '@/components/ui/data-table';

interface Project {
  id: string;
  name: string;
  description: string | null;
  client_company: string;
  status: string;
  created_by: string;
  created_at: string;
  deadline?: string | null;
  start_date?: string | null;
  // Enriched fields from v_project_summary
  file_count?: number;
  comment_count?: number;
  approved_count?: number;
  pending_count?: number;
  revision_count?: number;
  total_file_size?: number;
  unread_team_comments?: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active: { label: 'نشط', variant: 'default' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  review: { label: 'مراجعة', variant: 'outline' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  archived: { label: 'مؤرشف', variant: 'secondary' },
};

/** Check if a project is overdue (deadline passed + not completed/archived) */
function isProjectOverdue(p: Project): boolean {
  if (!p.deadline) return false;
  if (p.status === 'completed' || p.status === 'archived') return false;
  return new Date(p.deadline) < new Date();
}

export default function ProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreate = usePermission('projects.create');
  const canEdit = usePermission('projects.edit');
  const canDelete = usePermission('projects.delete');
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const urlStatus = searchParams.get('status');
    return urlStatus || 'all';
  });
  const [highlightId] = useState(() => searchParams.get('highlight'));
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', description: '', client_company: '', status: 'active', deadline: '', start_date: '' });
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/projects?${params}`);
      const json = await res.json();
      if (json.data) setProjects(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchProjects();
    fetch('/api/clients').then(r => r.json()).then(json => {
      if (json.data) setCompanies([...new Set(json.data.map((c: { company: string }) => c.company))] as string[]);
    }).catch(console.error);
  }, [fetchProjects]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('اسم المشروع مطلوب'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowCreate(false);
      setForm({ name: '', description: '', client_company: '', status: 'active', deadline: '', start_date: '' });
      toast.success('تم إنشاء المشروع بنجاح');
      fetchProjects();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowEdit(false);
      toast.success('تم تحديث المشروع');
      fetchProjects();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    const idsToDelete = bulkDeleteIds.length > 0 ? bulkDeleteIds : selected ? [selected.id] : [];
    if (idsToDelete.length === 0) return;
    setSaving(true);
    try {
      let hasError = false;
      for (const pid of idsToDelete) {
        const res = await fetch(`/api/projects/${pid}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.error) { toast.error(json.error); hasError = true; }
      }
      setShowDelete(false);
      setBulkDeleteIds([]);
      if (!hasError) toast.success(idsToDelete.length > 1 ? `تم حذف ${idsToDelete.length} مشاريع` : 'تم حذف المشروع');
      fetchProjects();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const openEdit = (p: Project) => {
    setSelected(p);
    setForm({ name: p.name, description: p.description || '', client_company: p.client_company, status: p.status, deadline: p.deadline || '', start_date: p.start_date || '' });
    setShowEdit(true);
  };

  const openDelete = (p: Project) => {
    setSelected(p);
    setShowDelete(true);
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      // Optimistic update
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
      );
      toast.success('تم تحديث حالة المشروع');
    } catch {
      toast.error('حدث خطأ');
    }
  };

  /* ── sort handler ── */
  const handleSortChange = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
      }
      return { key, direction: 'asc' };
    });
  }, []);

  /* ── sorted projects ── */
  const sortedProjects = useMemo(() => {
    if (!sortConfig) return projects;
    return [...projects].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortConfig.key) {
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'client': aVal = a.client_company; bVal = b.client_company; break;
        case 'files': aVal = a.file_count ?? 0; bVal = b.file_count ?? 0; break;
        case 'deadline': aVal = a.deadline || 'zzzz'; bVal = b.deadline || 'zzzz'; break;
        case 'created_at': aVal = a.created_at; bVal = b.created_at; break;
        default: return 0;
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal), 'ar')
        : String(bVal).localeCompare(String(aVal), 'ar');
    });
  }, [projects, sortConfig]);

  /* ── column definitions ── */
  const projectColumns: ColumnDef<Project>[] = useMemo(() => [
    {
      key: 'name',
      header: 'المشروع',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-medium text-primary hover:underline cursor-pointer" onClick={() => router.push(`/dashboard/projects/${p.id}`)}>{p.name}</div>
          {p.description && <div className="text-xs text-muted-foreground truncate max-w-[300px]">{p.description}</div>}
          <div className="flex items-center gap-3 mt-1">
            {(p.comment_count ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <MessageSquare className="h-3 w-3" /> {p.comment_count}
                {(p.unread_team_comments ?? 0) > 0 && (
                  <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-900/30">
                    {p.unread_team_comments} جديد
                  </Badge>
                )}
              </span>
            )}
            {(p.total_file_size ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <HardDrive className="h-3 w-3" /> {formatFileSize(p.total_file_size || 0)}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'العميل',
      sortable: true,
      className: 'text-muted-foreground',
      render: (p) => p.client_company,
    },
    {
      key: 'files',
      header: 'الملفات',
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm">{p.file_count ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'approvals',
      header: 'الموافقات',
      render: (p) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(p.approved_count ?? 0) > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle className="h-3 w-3 me-0.5" /> {p.approved_count}
            </Badge>
          )}
          {(p.pending_count ?? 0) > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400">
              <Clock className="h-3 w-3 me-0.5" /> {p.pending_count}
            </Badge>
          )}
          {(p.revision_count ?? 0) > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
              <AlertTriangle className="h-3 w-3 me-0.5" /> {p.revision_count}
            </Badge>
          )}
          {(p.approved_count ?? 0) === 0 && (p.pending_count ?? 0) === 0 && (p.revision_count ?? 0) === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (p) => {
        const s = STATUS_MAP[p.status] || { label: p.status, variant: 'secondary' as const };
        const overdue = isProjectOverdue(p);
        return (
          <div className="flex items-center gap-1">
            <Badge variant={s.variant}>{s.label}</Badge>
            {overdue && (
              <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400">
                <AlertTriangle className="h-3 w-3 me-0.5" /> متأخر
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'deadline',
      header: 'الموعد النهائي',
      sortable: true,
      render: (p) => {
        const overdue = isProjectOverdue(p);
        return p.deadline ? (
          <div className={cn(
            'flex items-center gap-1 text-xs',
            overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground',
          )}>
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span>{formatDate(p.deadline)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: 'created_at',
      header: 'تاريخ الإنشاء',
      sortable: true,
      className: 'text-muted-foreground text-xs',
      render: (p) => formatDate(p.created_at),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-[60px]',
      render: (p) => (
        <div data-no-row-click>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/dashboard/projects/${p.id}`)}><Eye className="h-4 w-4 me-2" /> عرض التفاصيل</DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="h-4 w-4 me-2" /> تعديل</DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => openDelete(p)} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 me-2" /> حذف</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [router, canEdit, canDelete, openEdit, openDelete]);

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="h-6 w-6" /> المشاريع</h1>
          <p className="text-muted-foreground">إدارة مشاريع العملاء</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm({ name: '', description: '', client_company: '', status: 'active', deadline: '', start_date: '' }); setShowCreate(true); }}>
            <Plus className="h-4 w-4 me-2" /> مشروع جديد
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث عن مشروع..."
          className="flex-1 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="review">مراجعة</SelectItem>
            <SelectItem value="overdue">متأخر</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
            <SelectItem value="archived">مؤرشف</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-lg p-0.5 gap-0.5 ms-auto">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode('table')}
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <ProjectKanban
          projects={sortedProjects}
          onEdit={canEdit ? openEdit : undefined}
          onDelete={canDelete ? openDelete : undefined}
          onStatusChange={canEdit ? handleStatusChange : undefined}
        />
      ) : (
      <DataTable
        columns={projectColumns}
        data={sortedProjects}
        loading={loading}
        emptyState={{
          icon: Briefcase,
          title: 'لا توجد مشاريع',
          description: 'أنشئ مشروعاً جديداً للبدء',
        }}
        selectable
        getRowId={(p) => p.id}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
        onRowClick={(p) => router.push(`/dashboard/projects/${p.id}`)}
        rowClassName={(p) => highlightId === p.id ? 'animate-pulse bg-orange-50 dark:bg-orange-950/20' : ''}
        bulkActions={canDelete ? [
          {
            label: 'حذف المحدد',
            icon: Trash2,
            variant: 'destructive',
            onClick: (ids) => {
              setBulkDeleteIds(ids);
              setSelected(null);
              setShowDelete(true);
            },
          },
        ] : []}
      />
      )}

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>مشروع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><FormLabel required>اسم المشروع</FormLabel><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><FormLabel>الوصف</FormLabel><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <FormLabel required>شركة العميل</FormLabel>
              <Select value={form.client_company} onValueChange={v => setForm(p => ({ ...p, client_company: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر شركة..." /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><FormLabel>تاريخ البدء</FormLabel><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="space-y-2"><FormLabel>الموعد النهائي</FormLabel><Input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>تعديل — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><FormLabel required>اسم المشروع</FormLabel><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><FormLabel>الوصف</FormLabel><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <FormLabel>الحالة</FormLabel>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                  <SelectItem value="review">مراجعة</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="archived">مؤرشف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FormLabel required>شركة العميل</FormLabel>
              <Select value={form.client_company} onValueChange={v => setForm(p => ({ ...p, client_company: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><FormLabel>تاريخ البدء</FormLabel><Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div className="space-y-2"><FormLabel>الموعد النهائي</FormLabel><Input type="date" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف المشروع</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            {bulkDeleteIds.length > 1
              ? `هل أنت متأكد من حذف ${bulkDeleteIds.length} مشاريع؟ سيتم حذف جميع الملفات والتعليقات المرتبطة.`
              : <>هل أنت متأكد من حذف المشروع <strong>{selected?.name}</strong>؟ سيتم حذف جميع الملفات والتعليقات المرتبطة.</>
            }
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

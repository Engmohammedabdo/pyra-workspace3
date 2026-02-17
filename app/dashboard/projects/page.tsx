'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Briefcase, Plus, Search, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Project {
  id: string;
  name: string;
  description: string | null;
  client_company: string;
  status: string;
  created_by: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  review: { label: 'مراجعة', variant: 'outline' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  archived: { label: 'مؤرشف', variant: 'secondary' },
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', client_company: '', status: 'active' });

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
      setForm({ name: '', description: '', client_company: '', status: 'active' });
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
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      toast.success('تم حذف المشروع');
      fetchProjects();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const openEdit = (p: Project) => {
    setSelected(p);
    setForm({ name: p.name, description: p.description || '', client_company: p.client_company, status: p.status });
    setShowEdit(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase className="h-6 w-6" /> المشاريع</h1>
          <p className="text-muted-foreground">إدارة مشاريع العملاء</p>
        </div>
        <Button onClick={() => { setForm({ name: '', description: '', client_company: '', status: 'active' }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 me-2" /> مشروع جديد
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن مشروع..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
            <SelectItem value="review">مراجعة</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem>
            <SelectItem value="archived">مؤرشف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">المشروع</th>
                  <th className="text-start p-3 font-medium">العميل</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-start p-3 font-medium w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>)}</tr>
                )) : projects.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد مشاريع</td></tr>
                ) : projects.map(p => {
                  const s = STATUS_MAP[p.status] || { label: p.status, variant: 'secondary' as const };
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="font-medium">{p.name}</div>
                        {p.description && <div className="text-xs text-muted-foreground truncate max-w-[300px]">{p.description}</div>}
                      </td>
                      <td className="p-3 text-muted-foreground">{p.client_company}</td>
                      <td className="p-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                      <td className="p-3 text-muted-foreground text-xs">{formatDate(p.created_at)}</td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="h-4 w-4 me-2" /> تعديل</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelected(p); setShowDelete(true); }} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 me-2" /> حذف</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>مشروع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>اسم المشروع</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الوصف</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>شركة العميل</Label>
              <Select value={form.client_company} onValueChange={v => setForm(p => ({ ...p, client_company: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر شركة..." /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
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
            <div className="space-y-2"><Label>اسم المشروع</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الوصف</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>الحالة</Label>
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
              <Label>شركة العميل</Label>
              <Select value={form.client_company} onValueChange={v => setForm(p => ({ ...p, client_company: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
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
          <p className="text-sm text-muted-foreground py-4">هل أنت متأكد من حذف المشروع <strong>{selected?.name}</strong>؟ سيتم حذف جميع الملفات والتعليقات المرتبطة.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

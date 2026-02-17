'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Building2, Plus, Search, MoreHorizontal, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  is_active: boolean;
  created_at: string;
}

export default function ClientsClient() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', password: '', is_active: true });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await fetch(`/api/clients?${params}`);
      const json = await res.json();
      if (json.data) setClients(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowCreate(false);
      setForm({ name: '', email: '', phone: '', company: '', password: '', is_active: true });
      toast.success('تم إنشاء العميل بنجاح');
      fetchClients();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone || null, company: form.company, is_active: form.is_active }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowEdit(false);
      toast.success('تم تحديث العميل');
      fetchClients();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDelete(false);
      toast.success('تم حذف العميل');
      fetchClients();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({ name: c.name, email: c.email, phone: c.phone || '', company: c.company, password: '', is_active: c.is_active });
    setShowEdit(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> العملاء</h1>
          <p className="text-muted-foreground">إدارة حسابات العملاء</p>
        </div>
        <Button onClick={() => { setForm({ name: '', email: '', phone: '', company: '', password: '', is_active: true }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 me-2" /> إضافة عميل
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="بحث عن عميل..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">العميل</th>
                  <th className="text-start p-3 font-medium">الشركة</th>
                  <th className="text-start p-3 font-medium">التواصل</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-start p-3 font-medium w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 6 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>)}</tr>
                )) : clients.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا يوجد عملاء</td></tr>
                ) : clients.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-600">{c.name.charAt(0)}</div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{c.company}</td>
                    <td className="p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {c.email}</div>
                        {c.phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {c.phone}</div>}
                      </div>
                    </td>
                    <td className="p-3"><Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'نشط' : 'معطل'}</Badge></td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(c.created_at)}</td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}><Pencil className="h-4 w-4 me-2" /> تعديل</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelected(c); setShowDelete(true); }} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 me-2" /> حذف</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الاسم</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>الشركة</Label><Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>البريد الإلكتروني</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" /></div>
            </div>
            <div className="space-y-2"><Label>كلمة المرور (لبوابة العميل)</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} dir="ltr" /></div>
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
          <DialogHeader><DialogTitle>تعديل العميل — {selected?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الاسم</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>الشركة</Label><Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>البريد</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} dir="ltr" /></div>
              <div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <Label>حساب نشط</Label>
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
          <DialogHeader><DialogTitle>حذف العميل</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">هل أنت متأكد من حذف العميل <strong>{selected?.name}</strong>؟ سيتم التحقق من وجود سجلات مرتبطة.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

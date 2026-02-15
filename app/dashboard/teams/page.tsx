'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Building2, Plus, MoreHorizontal, Pencil, Trash2, UserPlus, UserMinus, Users as UsersIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';

interface Team {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  members?: TeamMember[];
}

interface TeamMember {
  id: string;
  username: string;
  added_by: string;
  added_at: string;
  display_name?: string;
}

interface UserLite { username: string; display_name: string; }

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [selected, setSelected] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [newMember, setNewMember] = useState('');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/teams');
      const json = await res.json();
      if (json.data) setTeams(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTeams();
    fetch('/api/users/lite').then(r => r.json()).then(json => { if (json.data) setUsers(json.data); }).catch(console.error);
  }, [fetchTeams]);

  const fetchTeamDetail = async (teamId: string) => {
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      const json = await res.json();
      if (json.data) setSelected(json.data);
    } catch (err) { console.error(err); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowCreate(false); setForm({ name: '', description: '' }); fetchTeams();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowEdit(false); fetchTeams();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowDelete(false); fetchTeams();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const addMember = async () => {
    if (!selected || !newMember) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${selected.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newMember }) });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setNewMember(''); fetchTeamDetail(selected.id);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const removeMember = async (username: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/teams/${selected.id}/members?username=${username}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      fetchTeamDetail(selected.id);
    } catch (err) { console.error(err); }
  };

  const openMembers = async (team: Team) => {
    setSelected(team); setShowMembers(true);
    await fetchTeamDetail(team.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> الفرق</h1>
          <p className="text-muted-foreground">إدارة فرق العمل والأعضاء</p>
        </div>
        <Button onClick={() => { setForm({ name: '', description: '' }); setShowCreate(true); }}>
          <Plus className="h-4 w-4 me-2" /> فريق جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">الفريق</th>
                  <th className="text-start p-3 font-medium">الوصف</th>
                  <th className="text-start p-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-start p-3 font-medium w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 4 }).map((_, j) => <td key={j} className="p-3"><Skeleton className="h-5 w-24" /></td>)}</tr>
                )) : teams.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد فرق</td></tr>
                ) : teams.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center"><UsersIcon className="h-4 w-4 text-green-600" /></div>
                        <span className="font-medium">{t.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{t.description || '—'}</td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(t.created_at)}</td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openMembers(t)}><UsersIcon className="h-4 w-4 me-2" /> الأعضاء</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelected(t); setForm({ name: t.name, description: t.description || '' }); setShowEdit(true); }}><Pencil className="h-4 w-4 me-2" /> تعديل</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelected(t); setShowDelete(true); }} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4 me-2" /> حذف</DropdownMenuItem>
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>فريق جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>اسم الفريق</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الوصف</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>تعديل — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>اسم الفريق</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الوصف</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>أعضاء — {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Select value={newMember} onValueChange={setNewMember}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="اختر مستخدم..." /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.username} value={u.username}>{u.display_name} (@{u.username})</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={addMember} disabled={saving || !newMember}><UserPlus className="h-4 w-4 me-2" /> إضافة</Button>
            </div>
            <div className="space-y-2">
              {selected?.members && selected.members.length > 0 ? selected.members.map(m => (
                <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-orange-500/10 flex items-center justify-center text-xs font-bold text-orange-600">{(m.display_name || m.username).charAt(0)}</div>
                    <div>
                      <div className="text-sm font-medium">{m.display_name || m.username}</div>
                      <div className="text-xs text-muted-foreground">@{m.username}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMember(m.username)}><UserMinus className="h-4 w-4" /></Button>
                </div>
              )) : <p className="text-center text-muted-foreground text-sm py-4">لا يوجد أعضاء بعد</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف الفريق</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">هل أنت متأكد من حذف الفريق <strong>{selected?.name}</strong>؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

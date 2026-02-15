'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Shield, Plus, Trash2, FolderLock } from 'lucide-react';

interface Permission {
  id: string;
  file_path: string;
  target_type: 'user' | 'team';
  target_id: string;
  permissions: Record<string, boolean>;
  granted_by: string;
  expires_at: string | null;
  created_at: string;
}

interface UserLite { username: string; display_name: string; }
interface Team { id: string; name: string; }

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    file_path: '',
    target_type: 'user' as 'user' | 'team',
    target_id: '',
    can_read: true,
    can_write: false,
    can_delete: false,
    can_share: false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [permsRes, usersRes, teamsRes] = await Promise.all([
        fetch('/api/files?prefix=').catch(() => null),
        fetch('/api/users/lite'),
        fetch('/api/teams'),
      ]);

      // Try to fetch permissions from a custom source or build from user data
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        if (usersJson.data) setUsers(usersJson.data);
      }
      if (teamsRes.ok) {
        const teamsJson = await teamsRes.json();
        if (teamsJson.data) setTeams(teamsJson.data);
      }

      // Build permissions list from users who have permissions set
      const allUsersRes = await fetch('/api/users?role=');
      if (allUsersRes.ok) {
        const allUsersJson = await allUsersRes.json();
        if (allUsersJson.data) {
          const perms: Permission[] = [];
          for (const user of allUsersJson.data) {
            const up = user.permissions as { paths?: Record<string, string>; per_folder?: Record<string, Record<string, boolean>> };
            if (up?.paths) {
              for (const [path, level] of Object.entries(up.paths)) {
                perms.push({
                  id: `${user.username}-${path}`,
                  file_path: path,
                  target_type: 'user',
                  target_id: user.username,
                  permissions: {
                    read: true,
                    write: level === 'upload' || level === 'full',
                    delete: level === 'full',
                    share: level === 'full',
                  },
                  granted_by: 'admin',
                  expires_at: null,
                  created_at: user.created_at,
                });
              }
            }
          }
          setPermissions(perms);
        }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.target_id || !form.file_path) { alert('يرجى تعبئة جميع الحقول'); return; }
    setSaving(true);
    try {
      // Update user permissions via PATCH /api/users/[username]
      if (form.target_type === 'user') {
        const userRes = await fetch(`/api/users/${form.target_id}`);
        const userJson = await userRes.json();
        if (userJson.error) { alert(userJson.error); return; }

        const currentPerms = userJson.data?.permissions || {};
        const paths = (currentPerms as Record<string, unknown>).paths as Record<string, string> || {};

        let level = 'browse';
        if (form.can_delete || form.can_share) level = 'full';
        else if (form.can_write) level = 'upload';

        paths[form.file_path] = level;

        const res = await fetch(`/api/users/${form.target_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: { ...currentPerms, paths } }),
        });
        const json = await res.json();
        if (json.error) { alert(json.error); return; }
      }

      setShowCreate(false);
      setForm({ file_path: '', target_type: 'user', target_id: '', can_read: true, can_write: false, can_delete: false, can_share: false });
      fetchData();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const removePermission = async (perm: Permission) => {
    if (perm.target_type !== 'user') return;
    try {
      const userRes = await fetch(`/api/users/${perm.target_id}`);
      const userJson = await userRes.json();
      if (userJson.error) return;

      const currentPerms = userJson.data?.permissions || {};
      const paths = { ...((currentPerms as Record<string, unknown>).paths as Record<string, string> || {}) };
      delete paths[perm.file_path];

      await fetch(`/api/users/${perm.target_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: { ...currentPerms, paths } }),
      });
      fetchData();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" /> الصلاحيات</h1>
          <p className="text-muted-foreground">إدارة صلاحيات الوصول للملفات والمجلدات</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 me-2" /> صلاحية جديدة
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : permissions.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <FolderLock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>لا توجد صلاحيات مخصصة</p>
          <p className="text-xs mt-1">أضف صلاحيات للمستخدمين أو الفرق للتحكم في الوصول</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-start p-3 font-medium">المسار</th>
                    <th className="text-start p-3 font-medium">النوع</th>
                    <th className="text-start p-3 font-medium">الهدف</th>
                    <th className="text-start p-3 font-medium">الصلاحيات</th>
                    <th className="text-start p-3 font-medium w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map(p => (
                    <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs" dir="ltr">{p.file_path}</td>
                      <td className="p-3"><Badge variant="outline">{p.target_type === 'user' ? 'مستخدم' : 'فريق'}</Badge></td>
                      <td className="p-3 font-medium">{p.target_id}</td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.permissions.read && <Badge variant="secondary" className="text-[10px]">قراءة</Badge>}
                          {p.permissions.write && <Badge variant="secondary" className="text-[10px]">كتابة</Badge>}
                          {p.permissions.delete && <Badge variant="secondary" className="text-[10px]">حذف</Badge>}
                          {p.permissions.share && <Badge variant="secondary" className="text-[10px]">مشاركة</Badge>}
                        </div>
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removePermission(p)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>إضافة صلاحية جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>مسار المجلد</Label>
              <Input value={form.file_path} onChange={e => setForm(p => ({ ...p, file_path: e.target.value }))} placeholder="/path/to/folder" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>نوع الهدف</Label>
              <Select value={form.target_type} onValueChange={v => setForm(p => ({ ...p, target_type: v as 'user' | 'team', target_id: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">مستخدم</SelectItem>
                  <SelectItem value="team">فريق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{form.target_type === 'user' ? 'المستخدم' : 'الفريق'}</Label>
              <Select value={form.target_id} onValueChange={v => setForm(p => ({ ...p, target_id: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>
                  {form.target_type === 'user'
                    ? users.map(u => <SelectItem key={u.username} value={u.username}>{u.display_name}</SelectItem>)
                    : teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>الصلاحيات</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.can_read} onCheckedChange={v => setForm(p => ({ ...p, can_read: !!v }))} />
                  <Label className="font-normal">قراءة</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.can_write} onCheckedChange={v => setForm(p => ({ ...p, can_write: !!v }))} />
                  <Label className="font-normal">كتابة</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.can_delete} onCheckedChange={v => setForm(p => ({ ...p, can_delete: !!v }))} />
                  <Label className="font-normal">حذف</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={form.can_share} onCheckedChange={v => setForm(p => ({ ...p, can_share: !!v }))} />
                  <Label className="font-normal">مشاركة</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

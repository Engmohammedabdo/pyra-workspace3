'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Key,
  Shield,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/format';

interface PyraUser {
  id: number;
  username: string;
  role: 'admin' | 'employee';
  display_name: string;
  permissions: Record<string, unknown>;
  created_at: string;
}

export default function UsersClient() {
  const [users, setUsers] = useState<PyraUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PyraUser | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'employee' as 'admin' | 'employee',
  });
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (json.data) setUsers(json.data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowCreateDialog(false);
      setFormData({ username: '', display_name: '', password: '', role: 'employee' });
      fetchUsers();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: formData.display_name, role: formData.role }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowEditDialog(false);
      fetchUsers();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handlePasswordChange = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.username}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowPasswordDialog(false);
      setNewPassword('');
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.username}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setShowDeleteDialog(false);
      fetchUsers();
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const openEdit = (user: PyraUser) => {
    setSelectedUser(user);
    setFormData({ username: user.username, display_name: user.display_name, password: '', role: user.role });
    setShowEditDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            المستخدمون
          </h1>
          <p className="text-muted-foreground">إدارة حسابات المستخدمين والصلاحيات</p>
        </div>
        <Button onClick={() => {
          setFormData({ username: '', display_name: '', password: '', role: 'employee' });
          setShowCreateDialog(true);
        }}>
          <Plus className="h-4 w-4 me-2" />
          إضافة مستخدم
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن مستخدم..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأدوار</SelectItem>
            <SelectItem value="admin">مسؤول</SelectItem>
            <SelectItem value="employee">موظف</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">المستخدم</th>
                  <th className="text-start p-3 font-medium">اسم العرض</th>
                  <th className="text-start p-3 font-medium">الدور</th>
                  <th className="text-start p-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-start p-3 font-medium w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-8" /></td>
                  </tr>
                )) : users.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>
                ) : users.map(user => (
                  <tr key={user.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center text-xs font-bold text-orange-600">
                          {user.display_name.charAt(0)}
                        </div>
                        <span className="font-mono text-xs">@{user.username}</span>
                      </div>
                    </td>
                    <td className="p-3 font-medium">{user.display_name}</td>
                    <td className="p-3">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? <><Shield className="h-3 w-3 me-1" /> مسؤول</> : 'موظف'}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(user.created_at)}</td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            <Pencil className="h-4 w-4 me-2" /> تعديل
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelectedUser(user); setNewPassword(''); setShowPasswordDialog(true); }}>
                            <Key className="h-4 w-4 me-2" /> تغيير كلمة المرور
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelectedUser(user); setShowDeleteDialog(true); }} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4 me-2" /> حذف
                          </DropdownMenuItem>
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

      {/* Create User */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input value={formData.username} onChange={e => setFormData(p => ({ ...p, username: e.target.value }))} placeholder="username" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>اسم العرض</Label>
              <Input value={formData.display_name} onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))} placeholder="الاسم الكامل" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input type="password" value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="12 حرف على الأقل" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">موظف</SelectItem>
                  <SelectItem value="admin">مسؤول</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>تعديل المستخدم — @{selectedUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم العرض</Label>
              <Input value={formData.display_name} onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">موظف</SelectItem>
                  <SelectItem value="admin">مسؤول</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>تغيير كلمة المرور — @{selectedUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="12 حرف على الأقل" dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>إلغاء</Button>
            <Button onClick={handlePasswordChange} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'تغيير'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>حذف المستخدم</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف المستخدم <strong>@{selectedUser?.username}</strong>؟ هذا الإجراء لا يمكن التراجع عنه.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>{saving ? 'جارٍ الحذف...' : 'حذف'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

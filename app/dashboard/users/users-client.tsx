'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
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
  MoreHorizontal,
  Pencil,
  Trash2,
  Key,
  Shield,
  Loader2,
} from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils/cn';
import { getRoleColorClasses } from '@/lib/auth/rbac';

interface PyraRole {
  name: string;
  name_ar: string;
  color: string;
  icon: string;
}

interface PyraUser {
  id: number;
  username: string;
  role: 'admin' | 'employee';
  role_id: string | null;
  display_name: string;
  phone: string | null;
  job_title: string | null;
  status: string;
  permissions: Record<string, unknown>;
  created_at: string;
  pyra_roles: PyraRole | null;
}

interface RoleOption {
  id: string;
  name: string;
  name_ar: string;
  color: string;
  icon: string;
}

export default function UsersClient() {
  const canManage = usePermission('users.manage');
  const [users, setUsers] = useState<PyraUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PyraUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState('active');

  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'employee' as 'admin' | 'employee',
    role_id: '' as string,
    job_title: '',
    phone: '',
  });
  const [newPassword, setNewPassword] = useState('');

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch roles list on mount
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await fetch('/api/roles');
        const json = await res.json();
        if (json.data) {
          setRoles(json.data.map((r: RoleOption & Record<string, unknown>) => ({
            id: r.id,
            name: r.name,
            name_ar: r.name_ar,
            color: r.color,
            icon: r.icon,
          })));
        }
      } catch (err) {
        console.error('Error fetching roles:', err);
      }
    };
    fetchRoles();
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const res = await fetch(`/api/users?${params}`);
      const json = await res.json();
      if (json.data) setUsers(json.data);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const resetFormData = () => {
    setFormData({
      username: '',
      display_name: '',
      password: '',
      role: 'employee',
      role_id: '',
      job_title: '',
      phone: '',
    });
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          role_id: formData.role_id || null,
          phone: formData.phone || null,
          job_title: formData.job_title || null,
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowCreateDialog(false);
      resetFormData();
      toast.success('تم إنشاء المستخدم بنجاح');
      fetchUsers();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: formData.display_name,
          role: formData.role,
          role_id: formData.role_id || null,
          phone: formData.phone || null,
          job_title: formData.job_title || null,
          status: editStatus,
        }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowEditDialog(false);
      toast.success('تم تحديث المستخدم');
      fetchUsers();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
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
      if (json.error) { toast.error(json.error); return; }
      setShowPasswordDialog(false);
      setNewPassword('');
      toast.success('تم تغيير كلمة المرور');
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.username}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      setShowDeleteDialog(false);
      toast.success('تم حذف المستخدم');
      fetchUsers();
    } catch (err) { console.error(err); toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const openEdit = (user: PyraUser) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      display_name: user.display_name,
      password: '',
      role: user.role,
      role_id: user.role_id || '',
      job_title: user.job_title || '',
      phone: user.phone || '',
    });
    setEditStatus(user.status || 'active');
    setShowEditDialog(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            المستخدمون
          </h1>
          <p className="text-muted-foreground">إدارة حسابات المستخدمين والصلاحيات</p>
        </div>
        {canManage && (
          <Button onClick={() => {
            resetFormData();
            setShowCreateDialog(true);
          }}>
            <Plus className="h-4 w-4 me-2" />
            إضافة مستخدم
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="بحث عن مستخدم..."
          className="flex-1 max-w-sm"
        />
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
                  <th className="text-start p-3 font-medium">المسمى الوظيفي</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">تاريخ الإنشاء</th>
                  <th className="text-start p-3 font-medium w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-24" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-16" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="p-3"><Skeleton className="h-5 w-8" /></td>
                  </tr>
                )) : users.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>
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
                      {user.pyra_roles ? (
                        <Badge variant="outline" className={getRoleColorClasses(user.pyra_roles.color)}>
                          {user.pyra_roles.name_ar}
                        </Badge>
                      ) : (
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role === 'admin' ? <><Shield className="h-3 w-3 me-1" /> مسؤول</> : 'موظف'}
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {user.job_title || '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <div className={cn('h-2 w-2 rounded-full', {
                          'bg-green-500': user.status === 'active',
                          'bg-yellow-500': user.status === 'inactive',
                          'bg-red-500': user.status === 'suspended',
                        })} />
                        <span className="text-xs">
                          {user.status === 'active' ? 'نشط' : user.status === 'inactive' ? 'غير نشط' : 'معلق'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(user.created_at)}</td>
                    {canManage && (
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
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create User */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            {/* Section 1: Account Info */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-muted-foreground">معلومات الحساب</Label>
              <div className="space-y-2">
                <FormLabel required>اسم المستخدم</FormLabel>
                <Input
                  value={formData.username}
                  onChange={e => setFormData(p => ({ ...p, username: e.target.value }))}
                  placeholder="username"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <FormLabel required>اسم العرض</FormLabel>
                <Input
                  value={formData.display_name}
                  onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="الاسم الكامل"
                />
              </div>
              <div className="space-y-2">
                <FormLabel required>كلمة المرور</FormLabel>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder="12 حرف على الأقل"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Section 2: Employee Info */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold text-muted-foreground">معلومات الموظف</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>نوع الحساب</FormLabel>
                  <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">موظف</SelectItem>
                      <SelectItem value="admin">مسؤول</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FormLabel>الدور الوظيفي</FormLabel>
                  <Select value={formData.role_id} onValueChange={v => setFormData(p => ({ ...p, role_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="بدون دور محدد" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">بدون دور محدد</SelectItem>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name_ar}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>المسمى الوظيفي</FormLabel>
                  <Input
                    value={formData.job_title}
                    onChange={e => setFormData(p => ({ ...p, job_title: e.target.value }))}
                    placeholder="مثال: مطور برمجيات"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>رقم الهاتف</FormLabel>
                  <Input
                    value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+971 50 000 0000"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</> : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader><DialogTitle>تعديل المستخدم — @{selectedUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-6 py-4">
            {/* Section 1: Basic Info */}
            <div className="space-y-4">
              <Label className="text-sm font-semibold text-muted-foreground">المعلومات الأساسية</Label>
              <div className="space-y-2">
                <FormLabel required>اسم العرض</FormLabel>
                <Input
                  value={formData.display_name}
                  onChange={e => setFormData(p => ({ ...p, display_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <FormLabel required>الحالة</FormLabel>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">غير نشط</SelectItem>
                    <SelectItem value="suspended">معلق</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section 2: Employee Info */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold text-muted-foreground">معلومات الموظف</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>نوع الحساب</FormLabel>
                  <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">موظف</SelectItem>
                      <SelectItem value="admin">مسؤول</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FormLabel>الدور الوظيفي</FormLabel>
                  <Select value={formData.role_id} onValueChange={v => setFormData(p => ({ ...p, role_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="بدون دور محدد" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">بدون دور محدد</SelectItem>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name_ar}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>المسمى الوظيفي</FormLabel>
                  <Input
                    value={formData.job_title}
                    onChange={e => setFormData(p => ({ ...p, job_title: e.target.value }))}
                    placeholder="مثال: مطور برمجيات"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>رقم الهاتف</FormLabel>
                  <Input
                    value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+971 50 000 0000"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</> : 'حفظ التغييرات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>تغيير كلمة المرور — @{selectedUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <FormLabel required>كلمة المرور الجديدة</FormLabel>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="12 حرف على الأقل" dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>إلغاء</Button>
            <Button onClick={handlePasswordChange} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</> : 'تغيير'}
            </Button>
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
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحذف...</> : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

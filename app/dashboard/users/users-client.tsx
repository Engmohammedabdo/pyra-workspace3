'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { PASSWORD_MIN_LENGTH, SALARY_CURRENCIES } from '@/lib/constants/auth';
import { useUsers } from '@/hooks/useUsers';
import Link from 'next/link';
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
  DialogDescription,
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
  ClipboardList,
} from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils/cn';
import { getRoleColorClasses, PERMISSION_MODULES } from '@/lib/auth/rbac';
import { useWorkSchedules } from '@/hooks/useWorkSchedules';

interface PyraRole {
  name: string;
  name_ar: string;
  color: string;
  icon: string;
}

interface PyraUser {
  id: number;
  username: string;
  role: 'admin' | 'employee' | 'sales_agent';
  role_id: string | null;
  display_name: string;
  phone: string | null;
  job_title: string | null;
  status: string;
  permissions: Record<string, unknown>;
  created_at: string;
  manager_username: string | null;
  pyra_roles: PyraRole | null;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'intern';
  work_location?: 'remote' | 'onsite' | 'hybrid';
  payment_type?: 'monthly_salary' | 'hourly' | 'per_task' | 'commission';
  salary?: number;
  salary_currency?: string;
  hourly_rate?: number;
  hire_date?: string;
  date_of_birth?: string | null;
  department?: string;
  national_id?: string | null;
  commission_rate?: number | null;
  extra_permissions?: string[];
  onboarding_id?: string | null;
  work_schedule_id?: string | null;
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
  const queryClient = useQueryClient();

  // React Query hooks
  const { data: users = [], isLoading: loading } = useUsers() as unknown as { data: PyraUser[]; isLoading: boolean };
  const { data: workSchedules = [] } = useWorkSchedules();
  const { data: roles = [] } = useQuery<RoleOption[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const json = await fetchAPI<{ data?: RoleOption[] } | RoleOption[]>('/api/roles');
      const arr = (json as { data?: RoleOption[] }).data ?? (json as RoleOption[]);
      return arr.map((r) => ({ id: r.id, name: r.name, name_ar: r.name_ar, color: r.color, icon: r.icon }));
    },
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PyraUser | null>(null);
  const [editStatus, setEditStatus] = useState('active');

  const [formData, setFormData] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'employee' as 'admin' | 'employee' | 'sales_agent',
    role_id: '' as string,
    job_title: '',
    phone: '',
    manager_username: '' as string,
    employment_type: '' as string,
    work_location: '' as string,
    payment_type: '' as string,
    salary: '' as string | number,
    salary_currency: 'AED' as string,
    hourly_rate: '' as string | number,
    hire_date: '',
    date_of_birth: '',
    department: '',
    national_id: '',
    commission_rate: '' as string | number,
    work_schedule_id: '' as string,
  });
  const [newPassword, setNewPassword] = useState('');
  const [extraPermissions, setExtraPermissions] = useState<string[]>([]);
  const [showExtraPermissions, setShowExtraPermissions] = useState(false);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);



  const resetFormData = () => {
    setFormData({
      username: '',
      display_name: '',
      password: '',
      role: 'employee',
      role_id: '',
      job_title: '',
      phone: '',
      manager_username: '',
      employment_type: '',
      work_location: '',
      payment_type: '',
      salary: '',
      salary_currency: 'AED',
      hourly_rate: '',
      hire_date: '',
      date_of_birth: '',
      department: '',
      national_id: '',
      commission_rate: '',
      work_schedule_id: '',
    });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/users', 'POST', data),
    onSuccess: () => { setShowCreateDialog(false); resetFormData(); toast.success('تم إنشاء المستخدم بنجاح'); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const editMutation = useMutation({
    mutationFn: ({ username, data }: { username: string; data: object }) => mutateAPI(`/api/users/${username}`, 'PATCH', data),
    onSuccess: () => { setShowEditDialog(false); toast.success('تم تحديث المستخدم'); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => mutateAPI(`/api/users/${username}/password`, 'POST', { password }),
    onSuccess: () => { setShowPasswordDialog(false); setNewPassword(''); toast.success('تم تغيير كلمة المرور'); },
    onError: () => toast.error('حدث خطأ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (username: string) => mutateAPI(`/api/users/${username}`, 'DELETE'),
    onSuccess: () => { setShowDeleteDialog(false); toast.success('تم حذف المستخدم'); invalidate(); },
    onError: () => toast.error('حدث خطأ'),
  });

  const saving = createMutation.isPending || editMutation.isPending || passwordMutation.isPending || deleteMutation.isPending;

  const handleCreate = () => {
    createMutation.mutate({
      ...formData,
      role_id: formData.role_id || null,
      phone: formData.phone || null,
      job_title: formData.job_title || null,
      salary_currency: formData.salary_currency || 'AED',
      national_id: formData.national_id || null,
      commission_rate: formData.commission_rate === '' ? null : Number(formData.commission_rate),
      work_schedule_id: formData.work_schedule_id || null,
    });
  };

  const handleEdit = () => {
    if (!selectedUser) return;
    editMutation.mutate({ username: selectedUser.username, data: {
      display_name: formData.display_name, role: formData.role, role_id: formData.role_id || null,
      phone: formData.phone || null, job_title: formData.job_title || null,
      manager_username: formData.manager_username || null, status: editStatus,
      employment_type: formData.employment_type || null, work_location: formData.work_location || null,
      payment_type: formData.payment_type || null,
      salary: formData.payment_type === 'monthly_salary' && formData.salary ? Number(formData.salary) : null,
      salary_currency: formData.salary_currency || 'AED',
      hourly_rate: formData.payment_type === 'hourly' && formData.hourly_rate ? Number(formData.hourly_rate) : null,
      hire_date: formData.hire_date || null, date_of_birth: formData.date_of_birth || null, department: formData.department || null,
      national_id: formData.national_id || null,
      commission_rate: formData.commission_rate === '' ? null : Number(formData.commission_rate),
      extra_permissions: extraPermissions,
      work_schedule_id: formData.work_schedule_id || null,
    }});
  };

  const handlePasswordChange = () => {
    if (!selectedUser) return;
    passwordMutation.mutate({ username: selectedUser.username, password: newPassword });
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    deleteMutation.mutate(selectedUser.username);
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
      manager_username: user.manager_username || '',
      employment_type: user.employment_type || '',
      work_location: user.work_location || '',
      payment_type: user.payment_type || '',
      salary: user.salary ?? '',
      salary_currency: user.salary_currency || 'AED',
      hourly_rate: user.hourly_rate ?? '',
      hire_date: user.hire_date || '',
      date_of_birth: user.date_of_birth || '',
      department: user.department || '',
      national_id: user.national_id || '',
      commission_rate: user.commission_rate ?? '',
      work_schedule_id: user.work_schedule_id || '',
    });
    setEditStatus(user.status || 'active');
    setExtraPermissions(Array.isArray(user.extra_permissions) ? user.extra_permissions : []);
    setShowExtraPermissions(false);
    setShowEditDialog(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" aria-hidden="true" />
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
                    <td className="p-3 font-medium">
                      <div className="space-y-1">
                        <Link href={`/dashboard/users/${user.username}`} className="hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                          {user.display_name}
                        </Link>
                        {user.onboarding_id && (
                          <Link
                            href={`/dashboard/hr/onboarding/${user.onboarding_id}`}
                            className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                            title="عرض ملف التعيين"
                            onClick={e => e.stopPropagation()}
                          >
                            <ClipboardList className="h-3 w-3" />
                            معيّن عبر التعيين
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {user.pyra_roles ? (
                        <Badge variant="outline" className={getRoleColorClasses(user.pyra_roles.color)}>
                          {user.pyra_roles.name_ar}
                        </Badge>
                      ) : (
                        <Badge variant={user.role === 'admin' ? 'default' : user.role === 'sales_agent' ? 'outline' : 'secondary'} className={user.role === 'sales_agent' ? 'border-orange-300 text-orange-700 dark:border-orange-600 dark:text-orange-400' : ''}>
                          {user.role === 'admin' ? <><Shield className="h-3 w-3 me-1" /> مسؤول</> : user.role === 'sales_agent' ? 'وكيل مبيعات' : 'موظف'}
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="المزيد"><MoreHorizontal className="h-4 w-4" /></Button>
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
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
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
                  placeholder={`${PASSWORD_MIN_LENGTH} أحرف على الأقل`}
                  dir="ltr"
                />
              </div>
            </div>

            {/* Section 2: Employee Info */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold text-muted-foreground">معلومات الموظف</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>نوع الحساب</FormLabel>
                  <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' | 'sales_agent' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">موظف</SelectItem>
                      <SelectItem value="sales_agent">وكيل مبيعات</SelectItem>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <FormLabel>جدول العمل</FormLabel>
                <Select
                  value={formData.work_schedule_id || '__none__'}
                  onValueChange={v => setFormData(p => ({ ...p, work_schedule_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— الجدول الافتراضي —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— الجدول الافتراضي —</SelectItem>
                    {workSchedules.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel required>نوع الحساب</FormLabel>
                  <Select value={formData.role} onValueChange={v => setFormData(p => ({ ...p, role: v as 'admin' | 'employee' | 'sales_agent' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">موظف</SelectItem>
                      <SelectItem value="sales_agent">وكيل مبيعات</SelectItem>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <FormLabel>المدير المباشر</FormLabel>
                <Select
                  value={formData.manager_username || '__none__'}
                  onValueChange={v => setFormData(p => ({ ...p, manager_username: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— بدون مدير —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون مدير —</SelectItem>
                    {users
                      .filter(u => u.username !== selectedUser?.username)
                      .map(u => (
                        <SelectItem key={u.username} value={u.username}>
                          {u.display_name} (@{u.username})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section: Extra Permissions (admin only) */}
            <div className="space-y-4 border-t pt-4">
              <button
                type="button"
                onClick={() => setShowExtraPermissions(prev => !prev)}
                className="flex items-center justify-between w-full text-start hover:opacity-80 transition-opacity"
              >
                <div>
                  <h3 className="text-sm font-semibold">صلاحيات إضافية</h3>
                  <p className="text-xs text-muted-foreground">صلاحيات ممنوحة لهذا المستخدم بالإضافة إلى صلاحيات دوره الأساسي</p>
                </div>
                <div className="flex items-center gap-2">
                  {extraPermissions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{extraPermissions.length}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{showExtraPermissions ? 'إخفاء' : 'عرض'}</span>
                </div>
              </button>
              {showExtraPermissions && (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pe-2">
                  {PERMISSION_MODULES.map(module => {
                    const modulePermKeys = module.permissions.map(p => p.key);
                    const allChecked = modulePermKeys.every(p => extraPermissions.includes(p));
                    return (
                      <div key={module.key} className="border border-border/40 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <h4 className="text-sm font-medium">{module.labelAr}</h4>
                            <p className="text-xs text-muted-foreground">{module.label}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              if (allChecked) {
                                setExtraPermissions(prev => prev.filter(p => !modulePermKeys.includes(p)));
                              } else {
                                setExtraPermissions(prev => Array.from(new Set([...prev, ...modulePermKeys])));
                              }
                            }}
                          >
                            {allChecked ? 'إلغاء الكل' : 'تحديد الكل'}
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {module.permissions.map(perm => (
                            <label
                              key={perm.key}
                              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/30 rounded p-1.5 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={extraPermissions.includes(perm.key)}
                                onChange={(e) => {
                                  setExtraPermissions(prev =>
                                    e.target.checked
                                      ? Array.from(new Set([...prev, perm.key]))
                                      : prev.filter(p => p !== perm.key)
                                  );
                                }}
                                className="rounded border-border"
                              />
                              <span className="flex-1">{perm.labelAr || perm.label}</span>
                              <code className="text-[10px] text-muted-foreground">{perm.key}</code>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section 3: Employment Data */}
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-semibold text-muted-foreground">بيانات التوظيف</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>نوع التوظيف</FormLabel>
                  <Select value={formData.employment_type} onValueChange={v => setFormData(p => ({ ...p, employment_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع التوظيف" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">غير محدد</SelectItem>
                      <SelectItem value="full_time">دوام كامل</SelectItem>
                      <SelectItem value="part_time">دوام جزئي</SelectItem>
                      <SelectItem value="contract">متعاقد</SelectItem>
                      <SelectItem value="freelance">مستقل</SelectItem>
                      <SelectItem value="intern">متدرب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FormLabel>مكان العمل</FormLabel>
                  <Select value={formData.work_location} onValueChange={v => setFormData(p => ({ ...p, work_location: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر مكان العمل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">غير محدد</SelectItem>
                      <SelectItem value="remote">عن بعد</SelectItem>
                      <SelectItem value="onsite">حضوري</SelectItem>
                      <SelectItem value="hybrid">هجين</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>نوع الدفع</FormLabel>
                  <Select value={formData.payment_type} onValueChange={v => setFormData(p => ({ ...p, payment_type: v === '__none__' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع الدفع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">غير محدد</SelectItem>
                      <SelectItem value="monthly_salary">راتب شهري</SelectItem>
                      <SelectItem value="hourly">بالساعة</SelectItem>
                      <SelectItem value="per_task">بالمهمة</SelectItem>
                      <SelectItem value="commission">عمولة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FormLabel>القسم</FormLabel>
                  <Input
                    value={formData.department}
                    onChange={e => setFormData(p => ({ ...p, department: e.target.value }))}
                    placeholder="مثال: التطوير"
                  />
                </div>
              </div>
              {formData.payment_type === 'monthly_salary' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>الراتب الشهري</FormLabel>
                    <Input
                      type="number"
                      value={formData.salary}
                      onChange={e => setFormData(p => ({ ...p, salary: e.target.value }))}
                      placeholder="0.00"
                      dir="ltr"
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>العملة</FormLabel>
                    <Select value={formData.salary_currency} onValueChange={v => setFormData(p => ({ ...p, salary_currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SALARY_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {formData.payment_type === 'hourly' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <FormLabel>سعر الساعة</FormLabel>
                    <Input
                      type="number"
                      value={formData.hourly_rate}
                      onChange={e => setFormData(p => ({ ...p, hourly_rate: e.target.value }))}
                      placeholder="0.00"
                      dir="ltr"
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <FormLabel>العملة</FormLabel>
                    <Select value={formData.salary_currency} onValueChange={v => setFormData(p => ({ ...p, salary_currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SALARY_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>رقم الهوية / الجواز</FormLabel>
                  <Input
                    value={formData.national_id}
                    onChange={e => setFormData(p => ({ ...p, national_id: e.target.value }))}
                    placeholder="مثال: 784-XXXX-XXXXXXX-X"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>نسبة العمولة %</FormLabel>
                  <Input
                    type="number"
                    value={formData.commission_rate}
                    onChange={e => setFormData(p => ({ ...p, commission_rate: e.target.value }))}
                    placeholder="0"
                    dir="ltr"
                    min={0}
                    max={100}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormLabel>تاريخ التعيين</FormLabel>
                  <Input
                    type="date"
                    value={formData.hire_date}
                    onChange={e => setFormData(p => ({ ...p, hire_date: e.target.value }))}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>تاريخ الميلاد</FormLabel>
                  <Input
                    type="date"
                    value={formData.date_of_birth ?? ''}
                    onChange={e => setFormData(p => ({ ...p, date_of_birth: e.target.value }))}
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <FormLabel>جدول العمل</FormLabel>
                <Select
                  value={formData.work_schedule_id || '__none__'}
                  onValueChange={v => setFormData(p => ({ ...p, work_schedule_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— الجدول الافتراضي —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— الجدول الافتراضي —</SelectItem>
                    {workSchedules.map(ws => (
                      <SelectItem key={ws.id} value={ws.id}>
                        {ws.name_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور — @{selectedUser?.username}</DialogTitle>
            <DialogDescription>{`اختر كلمة مرور قوية (${PASSWORD_MIN_LENGTH} أحرف على الأقل)`}</DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); handlePasswordChange(); }} className="space-y-4 py-4">
            {/* Hidden username field for autofill accessibility */}
            <input type="text" name="username" autoComplete="username" defaultValue={selectedUser?.username || ''} className="sr-only" readOnly tabIndex={-1} />
            <div className="space-y-2">
              <FormLabel required htmlFor="new-password">كلمة المرور الجديدة</FormLabel>
              <Input id="new-password" name="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={`${PASSWORD_MIN_LENGTH} أحرف على الأقل`} dir="ltr" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPasswordDialog(false)}>إلغاء</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 me-2 animate-spin" /> جارٍ الحفظ...</> : 'تغيير'}
              </Button>
            </DialogFooter>
          </form>
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

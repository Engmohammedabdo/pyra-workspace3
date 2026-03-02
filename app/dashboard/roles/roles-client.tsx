'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Users,
  Lock,
  Crown,
  Briefcase,
  Palette,
  Calculator,
  Eye,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { PERMISSION_MODULES, ROLE_COLORS, getRoleColorClasses } from '@/lib/auth/rbac';
import { usePermission } from '@/hooks/usePermission';
import type { PyraRole } from '@/types/database';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Crown, Shield, Briefcase, Palette, Calculator, Eye,
};

const COLOR_OPTIONS = Object.keys(ROLE_COLORS);

interface RoleFormData {
  name: string;
  name_ar: string;
  description: string;
  color: string;
  icon: string;
  permissions: string[];
}

const EMPTY_FORM: RoleFormData = {
  name: '',
  name_ar: '',
  description: '',
  color: 'gray',
  icon: 'Shield',
  permissions: [],
};

export default function RolesClient() {
  const queryClient = useQueryClient();
  const canManage = usePermission('roles.manage');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PyraRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<PyraRole | null>(null);
  const [fallbackRoleId, setFallbackRoleId] = useState('');
  const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Fetch roles
  const { data: roles = [], isLoading } = useQuery<PyraRole[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await fetch('/api/roles');
      if (!res.ok) throw new Error('فشل في جلب الأدوار');
      const json = await res.json();
      return json.data;
    },
  });

  // Create role
  const createMutation = useMutation({
    mutationFn: async (data: RoleFormData) => {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل في إنشاء الدور');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('تم إنشاء الدور بنجاح');
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update role
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RoleFormData> }) => {
      const res = await fetch(`/api/roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل في تحديث الدور');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('تم تحديث الدور بنجاح');
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete role
  const deleteMutation = useMutation({
    mutationFn: async ({ id, fallback_role_id }: { id: string; fallback_role_id?: string }) => {
      const url = new URL(`/api/roles/${id}`, window.location.origin);
      if (fallback_role_id) url.searchParams.set('fallback_role_id', fallback_role_id);
      const res = await fetch(url.toString(), { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل في حذف الدور');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('تم حذف الدور بنجاح');
      setDeleteDialogOpen(false);
      setDeletingRole(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditingRole(null);
    setFormData(EMPTY_FORM);
    setExpandedModules(new Set());
    setDialogOpen(true);
  }

  function openEdit(role: PyraRole) {
    setEditingRole(role);
    setFormData({
      name: role.name,
      name_ar: role.name_ar,
      description: role.description || '',
      color: role.color,
      icon: role.icon,
      permissions: [...role.permissions],
    });
    // Expand modules that have permissions set
    const expanded = new Set<string>();
    for (const mod of PERMISSION_MODULES) {
      if (mod.permissions.some(p => role.permissions.includes(p.key))) {
        expanded.add(mod.key);
      }
    }
    setExpandedModules(expanded);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingRole(null);
    setFormData(EMPTY_FORM);
  }

  function openDelete(role: PyraRole) {
    setDeletingRole(role);
    setFallbackRoleId('');
    setDeleteDialogOpen(true);
  }

  function togglePermission(perm: string) {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm],
    }));
  }

  function toggleModuleAll(moduleKey: string) {
    const mod = PERMISSION_MODULES.find(m => m.key === moduleKey);
    if (!mod) return;
    const allKeys = mod.permissions.map(p => p.key);
    const allChecked = allKeys.every(k => formData.permissions.includes(k));
    setFormData(prev => ({
      ...prev,
      permissions: allChecked
        ? prev.permissions.filter(p => !allKeys.includes(p))
        : [...new Set([...prev.permissions, ...allKeys])],
    }));
  }

  function toggleModuleExpand(key: string) {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSubmit() {
    if (!formData.name_ar.trim()) {
      toast.error('اسم الدور بالعربية مطلوب');
      return;
    }
    if (editingRole) {
      const updateData: Partial<RoleFormData> = {};
      if (editingRole.is_system) {
        // System roles: only allow name_ar, description, color, icon
        updateData.name_ar = formData.name_ar;
        updateData.description = formData.description;
        updateData.color = formData.color;
        updateData.icon = formData.icon;
      } else {
        Object.assign(updateData, formData);
      }
      updateMutation.mutate({ id: editingRole.id, data: updateData });
    } else {
      if (!formData.name.trim()) {
        toast.error('اسم الدور بالإنجليزية مطلوب');
        return;
      }
      createMutation.mutate(formData);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الأدوار والصلاحيات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة أدوار المستخدمين وصلاحياتهم في النظام</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="h-4 w-4 me-2" />
            إضافة دور
          </Button>
        )}
      </div>

      {/* Roles Grid */}
      {roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="لا توجد أدوار"
          description="قم بإنشاء دور جديد لتنظيم صلاحيات المستخدمين"
          actionLabel="إضافة دور"
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => {
            const IconComp = ICON_MAP[role.icon] || Shield;
            const colorClasses = getRoleColorClasses(role.color);
            const isSuperAdmin = role.permissions.includes('*');

            return (
              <Card key={role.id} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg border', colorClasses)}>
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{role.name_ar}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{role.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {role.is_system && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Lock className="h-3 w-3" />
                          نظام
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {role.description && (
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{role.member_count ?? 0} مستخدم</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {isSuperAdmin ? 'جميع الصلاحيات' : `${role.permissions.length} صلاحية`}
                    </Badge>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(role)}>
                        <Edit2 className="h-3.5 w-3.5 me-1.5" />
                        تعديل
                      </Button>
                      {!role.is_system && (
                        <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={() => openDelete(role)}>
                          <Trash2 className="h-3.5 w-3.5 me-1.5" />
                          حذف
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? `تعديل دور: ${editingRole.name_ar}` : 'إضافة دور جديد'}</DialogTitle>
            <DialogDescription>
              {editingRole?.is_system ? 'الأدوار النظامية: يمكن تعديل الاسم والوصف واللون فقط' : 'حدد اسم الدور والصلاحيات المطلوبة'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>الاسم بالإنجليزية</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. project_manager"
                  disabled={!!editingRole}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>الاسم بالعربية</Label>
                <Input
                  value={formData.name_ar}
                  onChange={e => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
                  placeholder="مثال: مدير مشاريع"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="وصف مختصر للدور وصلاحياته"
                rows={2}
              />
            </div>

            {/* Color & Icon */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>اللون</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={cn(
                        'w-8 h-8 rounded-lg border-2 transition-all',
                        getRoleColorClasses(color),
                        formData.color === color ? 'ring-2 ring-offset-2 ring-orange-500' : 'opacity-60 hover:opacity-100'
                      )}
                    >
                      <span className="sr-only">{color}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>الأيقونة</Label>
                <Select
                  value={formData.icon}
                  onValueChange={v => setFormData(prev => ({ ...prev, icon: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ICON_MAP).map(([name, Icon]) => (
                      <SelectItem key={name} value={name}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Permissions */}
            {!(editingRole?.is_system) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">الصلاحيات</Label>
                  <span className="text-xs text-muted-foreground">{formData.permissions.length} صلاحية محددة</span>
                </div>
                <div className="border rounded-lg divide-y">
                  {PERMISSION_MODULES.map((mod) => {
                    const isExpanded = expandedModules.has(mod.key);
                    const checkedCount = mod.permissions.filter(p => formData.permissions.includes(p.key)).length;
                    const allChecked = checkedCount === mod.permissions.length;
                    const someChecked = checkedCount > 0 && !allChecked;

                    return (
                      <div key={mod.key}>
                        <button
                          type="button"
                          onClick={() => toggleModuleExpand(mod.key)}
                          className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={allChecked}
                              ref={el => {
                                if (el) (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someChecked;
                              }}
                              onCheckedChange={() => toggleModuleAll(mod.key)}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="font-medium">{mod.labelAr}</span>
                            {checkedCount > 0 && (
                              <Badge variant="secondary" className="text-[10px]">{checkedCount}/{mod.permissions.length}</Badge>
                            )}
                          </div>
                          <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 ps-12 space-y-2">
                            {mod.permissions.map(perm => (
                              <label key={perm.key} className="flex items-center gap-3 text-sm cursor-pointer py-1">
                                <Checkbox
                                  checked={formData.permissions.includes(perm.key)}
                                  onCheckedChange={() => togglePermission(perm.key)}
                                />
                                <span>{perm.labelAr}</span>
                                <span className="text-[10px] text-muted-foreground ms-auto font-mono" dir="ltr">{perm.key}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white">
              {isSaving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {editingRole ? 'حفظ التعديلات' : 'إنشاء الدور'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف دور &quot;{deletingRole?.name_ar}&quot;؟</DialogTitle>
            <DialogDescription>
              {(deletingRole?.member_count ?? 0) > 0
                ? `هذا الدور مرتبط بـ ${deletingRole?.member_count} مستخدم. اختر دور بديل لنقل المستخدمين إليه.`
                : 'سيتم حذف هذا الدور نهائياً. هذا الإجراء لا يمكن التراجع عنه.'}
            </DialogDescription>
          </DialogHeader>

          {(deletingRole?.member_count ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>الدور البديل</Label>
              <Select value={fallbackRoleId} onValueChange={setFallbackRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر دور بديل..." />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter(r => r.id !== deletingRole?.id)
                    .map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name_ar}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || ((deletingRole?.member_count ?? 0) > 0 && !fallbackRoleId)}
              onClick={() => {
                if (deletingRole) {
                  deleteMutation.mutate({
                    id: deletingRole.id,
                    fallback_role_id: fallbackRoleId || undefined,
                  });
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              حذف الدور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

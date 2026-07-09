'use client';

import { useState, useEffect } from 'react';
import { useUsers } from '@/hooks/useUsers';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
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
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { PERMISSION_MODULES, ROLE_COLORS, getRoleColorClasses } from '@/lib/auth/rbac';
import { useRbacLabels } from '@/lib/i18n/rbac-labels';
import { usePermission } from '@/hooks/usePermission';
import { motion } from 'framer-motion';
import type { PyraRole } from '@/types/database';
import { useTranslations, useLocale } from 'next-intl';

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

// pyra_roles.name / name_ar are bilingual DB rows (admin-authored) — never
// migrated through next-intl. Render locale-conditionally per the CLAUDE.md
// "Bilingual DB rows" rule: AR shows name_ar; EN prefers name, falling back
// to name_ar when the role has no English name set.
function roleDisplayName(locale: string, role: { name: string; name_ar: string } | null | undefined): string {
  if (!role) return '';
  return locale === 'ar' ? role.name_ar : (role.name || role.name_ar);
}

export default function RolesClient() {
  const queryClient = useQueryClient();
  const { data: allUsers = [] } = useUsers() as { data: any[] };
  const canManage = usePermission('roles.manage');
  // Phase 6a Task 1 — labelAr was stripped from PERMISSION_MODULES; this
  // resolver reads messages/{ar,en}/rbac.json instead.
  const { moduleLabel, permissionLabel } = useRbacLabels();
  // Phase 6a Task 5 — full page-chrome migration onto users.roles.*.
  const t = useTranslations('users.roles');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PyraRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<PyraRole | null>(null);
  const [fallbackRoleId, setFallbackRoleId] = useState('');
  const [formData, setFormData] = useState<RoleFormData>(EMPTY_FORM);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersRole, setMembersRole] = useState<PyraRole | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addUserSearch, setAddUserSearch] = useState('');

  // Fetch roles
  const { data: roles = [], isLoading } = useQuery<PyraRole[]>({
    queryKey: ['roles'],
    queryFn: () => fetchAPI('/api/roles'),
  });

  // Create role
  const createMutation = useMutation({
    mutationFn: (data: RoleFormData) => mutateAPI('/api/roles', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('toast.createSuccess'));
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update role
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RoleFormData> }) =>
      mutateAPI(`/api/roles/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('toast.updateSuccess'));
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete role
  const deleteMutation = useMutation({
    mutationFn: ({ id, fallback_role_id }: { id: string; fallback_role_id?: string }) => {
      const url = fallback_role_id
        ? `/api/roles/${id}?fallback_role_id=${fallback_role_id}`
        : `/api/roles/${id}`;
      return mutateAPI(url, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(t('toast.deleteSuccess'));
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
      toast.error(t('toast.nameArRequired'));
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
        toast.error(t('toast.nameEnRequired'));
        return;
      }
      createMutation.mutate(formData);
    }
  }

  function fetchRoleMembers(roleId: string) {
    setMembers((allUsers as any[]).filter((u: any) => u.role_id === roleId));
  }

  async function assignUserToRole(username: string, roleId: string) {
    try {
      await mutateAPI(`/api/users/${username}`, 'PATCH', { role_id: roleId });
      toast.success(t('toast.assignSuccess'));
      fetchRoleMembers(roleId);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    } catch (err: any) {
      toast.error(err.message || t('toast.assignError'));
    }
  }

  async function unassignUserFromRole(username: string, roleId: string) {
    try {
      await mutateAPI(`/api/users/${username}`, 'PATCH', { role_id: null });
      toast.success(t('toast.unassignSuccess'));
      fetchRoleMembers(roleId);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    } catch (err: any) {
      toast.error(err.message || t('toast.unassignError'));
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
          <h1 className="text-2xl font-bold">{t('heading')}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t('subheading')}</p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="h-4 w-4 me-2" />
            {t('addButton')}
          </Button>
        )}
      </div>

      {/* Roles Grid */}
      {roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title={t('empty.title')}
          description={t('empty.description')}
          actionLabel={t('empty.actionLabel')}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role, idx) => {
            const IconComp = ICON_MAP[role.icon] || Shield;
            const colorClasses = getRoleColorClasses(role.color);
            const isSuperAdmin = role.permissions.includes('*');

            return (
              <motion.div
                key={role.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.2 }}
              >
              <Card className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-lg border', colorClasses)}>
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{roleDisplayName(locale, role)}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{locale === 'ar' ? role.name : role.name_ar}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {role.is_system && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Lock className="h-3 w-3" />
                          {t('systemBadge')}
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
                    <button
                      onClick={() => {
                        setMembersRole(role);
                        setMembersDialogOpen(true);
                        fetchRoleMembers(role.id);
                      }}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Users className="h-4 w-4" />
                      <span>{t('card.memberCount', { count: role.member_count ?? 0 })}</span>
                    </button>
                    <Badge variant="secondary" className="text-[10px]">
                      {isSuperAdmin ? t('card.allPermissions') : t('card.permissionCount', { count: role.permissions.length })}
                    </Badge>
                  </div>
                  {canManage && (
                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(role)}>
                        <Edit2 className="h-3.5 w-3.5 me-1.5" />
                        {t('card.edit')}
                      </Button>
                      {!role.is_system && (
                        <Button variant="ghost" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={() => openDelete(role)}>
                          <Trash2 className="h-3.5 w-3.5 me-1.5" />
                          {t('card.delete')}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? t('dialog.editTitle', { name: roleDisplayName(locale, editingRole) }) : t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>
              {editingRole?.is_system ? t('dialog.editSystemDescription') : t('dialog.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('dialog.nameEnLabel')}</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('dialog.nameEnPlaceholder')}
                  disabled={!!editingRole}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('dialog.nameArLabel')}</Label>
                <Input
                  value={formData.name_ar}
                  onChange={e => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
                  placeholder={t('dialog.nameArPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('dialog.descriptionLabel')}</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('dialog.descriptionPlaceholder')}
                rows={2}
              />
            </div>

            {/* Color & Icon */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('dialog.colorLabel')}</Label>
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
                <Label>{t('dialog.iconLabel')}</Label>
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
                  <Label className="text-base">{t('dialog.permissionsLabel')}</Label>
                  <span className="text-xs text-muted-foreground">{t('dialog.permissionsSelected', { count: formData.permissions.length })}</span>
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
                            <span className="font-medium">{moduleLabel(mod.key)}</span>
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
                                <span>{permissionLabel(perm.key)}</span>
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
            <Button variant="outline" onClick={closeDialog}>{tCommon('actions.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white">
              {isSaving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {editingRole ? t('dialog.saveChanges') : t('dialog.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title', { name: roleDisplayName(locale, deletingRole) })}</DialogTitle>
            <DialogDescription>
              {(deletingRole?.member_count ?? 0) > 0
                ? t('deleteDialog.warningWithMembers', { count: deletingRole?.member_count ?? 0 })
                : t('deleteDialog.warningNoMembers')}
            </DialogDescription>
          </DialogHeader>

          {(deletingRole?.member_count ?? 0) > 0 && (
            <div className="space-y-2">
              <Label>{t('deleteDialog.fallbackRoleLabel')}</Label>
              <Select value={fallbackRoleId} onValueChange={setFallbackRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('deleteDialog.fallbackPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {roles
                    .filter(r => r.id !== deletingRole?.id)
                    .map(r => (
                      <SelectItem key={r.id} value={r.id}>{roleDisplayName(locale, r)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{tCommon('actions.cancel')}</Button>
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
              {t('deleteDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('membersDialog.title', { name: roleDisplayName(locale, membersRole) })}</DialogTitle>
            <DialogDescription>
              {t('membersDialog.description')}
            </DialogDescription>
          </DialogHeader>

          {membersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current Members */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('membersDialog.currentMembers', { count: members.length })}</Label>
                {members.length === 0 ? (
                  <EmptyState icon={Users} title={t('membersDialog.empty')} className="py-4" />
                ) : (
                  <div className="space-y-2">
                    {members.map((user: any) => (
                      <div key={user.username} className="flex items-center justify-between p-2 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center text-xs font-bold text-orange-600">
                            {user.display_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{user.display_name}</p>
                            <p className="text-xs text-muted-foreground">@{user.username}</p>
                          </div>
                        </div>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => membersRole && unassignUserFromRole(user.username, membersRole.id)}
                          >
                            <UserMinus className="h-4 w-4 me-1" />
                            {t('membersDialog.remove')}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add User */}
              {canManage && (
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm font-medium">{t('membersDialog.addMember')}</Label>
                  <Input
                    value={addUserSearch}
                    onChange={(e) => setAddUserSearch(e.target.value)}
                    placeholder={t('membersDialog.searchPlaceholder')}
                    className="mb-2"
                  />
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {allUsers
                      .filter(u =>
                        u.role_id !== membersRole?.id &&
                        (u.display_name?.toLowerCase().includes(addUserSearch.toLowerCase()) ||
                         u.username?.toLowerCase().includes(addUserSearch.toLowerCase()))
                      )
                      .slice(0, 10)
                      .map((user: any) => (
                        <button
                          key={user.username}
                          onClick={() => membersRole && assignUserToRole(user.username, membersRole.id)}
                          className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-accent/50 transition-colors text-start"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                              {user.display_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <p className="text-sm">{user.display_name}</p>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                          </div>
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

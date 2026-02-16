'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Plus, Trash2, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { FileListItem } from '@/types/database';

interface UserLite {
  username: string;
  display_name: string;
}

interface UserPermEntry {
  username: string;
  displayName: string;
  level: 'browse' | 'upload' | 'full';
}

interface FilePermissionsDialogProps {
  file: FileListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_LABELS: Record<string, string> = {
  browse: 'تصفح فقط',
  upload: 'تصفح + رفع',
  full: 'تحكم كامل',
};

const LEVEL_COLORS: Record<string, string> = {
  browse: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  upload: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  full: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

export function FilePermissionsDialog({
  file,
  open,
  onOpenChange,
}: FilePermissionsDialogProps) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [permissions, setPermissions] = useState<UserPermEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for adding new permission
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('browse');

  const filePath = file?.path || '';
  const decodedName = file ? decodeURIComponent(file.name) : '';

  // Fetch users and their permissions for this file
  const fetchData = useCallback(async () => {
    if (!filePath) return;
    setLoading(true);

    try {
      // Fetch all users
      const [usersRes, allUsersRes] = await Promise.all([
        fetch('/api/users/lite'),
        fetch('/api/users?role='),
      ]);

      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        if (usersJson.data) setUsers(usersJson.data);
      }

      // Extract permissions for this specific path
      if (allUsersRes.ok) {
        const allUsersJson = await allUsersRes.json();
        if (allUsersJson.data) {
          const perms: UserPermEntry[] = [];
          for (const user of allUsersJson.data) {
            const up = user.permissions as { paths?: Record<string, string> } | null;
            if (up?.paths?.[filePath]) {
              perms.push({
                username: user.username,
                displayName: user.display_name,
                level: up.paths[filePath] as 'browse' | 'upload' | 'full',
              });
            }
          }
          setPermissions(perms);
        }
      }
    } catch (err) {
      console.error('Failed to fetch permissions data:', err);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    if (open && filePath) {
      fetchData();
      setSelectedUser('');
      setSelectedLevel('browse');
    }
  }, [open, filePath, fetchData]);

  const handleAdd = async () => {
    if (!selectedUser || !filePath) return;

    // Check if this user already has permission for this path
    if (permissions.some((p) => p.username === selectedUser)) {
      toast.error('المستخدم لديه صلاحيات بالفعل لهذا المسار');
      return;
    }

    setSaving(true);
    try {
      // Fetch current user data
      const userRes = await fetch(`/api/users/${selectedUser}`);
      const userJson = await userRes.json();
      if (userJson.error) {
        toast.error(userJson.error);
        return;
      }

      const currentPerms = userJson.data?.permissions || {};
      const paths = { ...((currentPerms as Record<string, unknown>).paths as Record<string, string> || {}) };
      paths[filePath] = selectedLevel;

      const res = await fetch(`/api/users/${selectedUser}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: { ...currentPerms, paths } }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }

      toast.success(`تم إضافة صلاحيات لـ "${selectedUser}"`);
      setSelectedUser('');
      setSelectedLevel('browse');
      fetchData();
    } catch {
      toast.error('فشل في إضافة الصلاحيات');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (username: string) => {
    setSaving(true);
    try {
      const userRes = await fetch(`/api/users/${username}`);
      const userJson = await userRes.json();
      if (userJson.error) return;

      const currentPerms = userJson.data?.permissions || {};
      const paths = { ...((currentPerms as Record<string, unknown>).paths as Record<string, string> || {}) };
      delete paths[filePath];

      await fetch(`/api/users/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: { ...currentPerms, paths } }),
      });

      toast.success(`تم إزالة صلاحيات "${username}"`);
      fetchData();
    } catch {
      toast.error('فشل في إزالة الصلاحيات');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeLevel = async (username: string, newLevel: string) => {
    setSaving(true);
    try {
      const userRes = await fetch(`/api/users/${username}`);
      const userJson = await userRes.json();
      if (userJson.error) return;

      const currentPerms = userJson.data?.permissions || {};
      const paths = { ...((currentPerms as Record<string, unknown>).paths as Record<string, string> || {}) };
      paths[filePath] = newLevel;

      await fetch(`/api/users/${username}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: { ...currentPerms, paths } }),
      });

      toast.success('تم تحديث مستوى الصلاحيات');
      fetchData();
    } catch {
      toast.error('فشل في تحديث الصلاحيات');
    } finally {
      setSaving(false);
    }
  };

  // Users not yet assigned to this path
  const availableUsers = users.filter(
    (u) => !permissions.some((p) => p.username === u.username)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            صلاحيات الملف
          </DialogTitle>
          <DialogDescription>
            إدارة صلاحيات الوصول لـ &quot;{decodedName}&quot;
          </DialogDescription>
        </DialogHeader>

        {/* File path display */}
        <div className="bg-muted/50 rounded-md px-3 py-2 text-xs font-mono" dir="ltr">
          {filePath}
        </div>

        {/* Current permissions list */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              جاري التحميل...
            </div>
          ) : permissions.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              لا توجد صلاحيات مخصصة لهذا المسار
            </div>
          ) : (
            permissions.map((perm) => (
              <div
                key={perm.username}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{perm.displayName}</p>
                    <p className="text-xs text-muted-foreground">{perm.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={perm.level}
                    onValueChange={(val) => handleChangeLevel(perm.username, val)}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browse">تصفح فقط</SelectItem>
                      <SelectItem value="upload">تصفح + رفع</SelectItem>
                      <SelectItem value="full">تحكم كامل</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleRemove(perm.username)}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add new permission */}
        {availableUsers.length > 0 && (
          <div className="flex items-end gap-2 pt-2 border-t">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium">إضافة مستخدم</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="اختر مستخدم..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {u.display_name} ({u.username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-1">
              <label className="text-xs font-medium">المستوى</label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browse">تصفح</SelectItem>
                  <SelectItem value="upload">رفع</SelectItem>
                  <SelectItem value="full">كامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-9"
              onClick={handleAdd}
              disabled={!selectedUser || saving}
            >
              <Plus className="h-4 w-4 me-1" />
              إضافة
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

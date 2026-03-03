'use client';

import { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  Download,
  Pencil,
  Trash2,
  FolderInput,
  Copy,
  MoreVertical,
  Shield,
  Star,
  Tags,
  Link2,
  Lock,
  Bell,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { useFavorites, useToggleFavorite } from '@/hooks/useFavorites';
import { FileTagsPopover } from './file-tags';
import { toast } from 'sonner';
import type { FileListItem } from '@/types/database';

interface FileContextMenuProps {
  file: FileListItem;
  children: React.ReactNode;
  onPreview: (file: FileListItem) => void;
  onDownload: (file: FileListItem) => void;
  onRename: (file: FileListItem, newName: string) => void;
  onDelete: (file: FileListItem) => void;
  onCopyPath: (file: FileListItem) => void;
  onPermissions?: (file: FileListItem) => void;
  isAdmin?: boolean;
}

// ── Share Dialog Component ──────────────────────────────────
interface ShareLink {
  id: string;
  file_path: string;
  file_name: string;
  created_by_display: string;
  expires_at: string;
  max_access: number;
  access_count: number;
  has_password: boolean;
  notification_email: string | null;
  created_at: string;
}

function ShareDialog({ file, open, onOpenChange }: { file: FileListItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [expiryHours, setExpiryHours] = useState('168'); // 7 days default
  const [maxDownloads, setMaxDownloads] = useState('0');
  const [password, setPassword] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');

  // Fetch existing links
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/shares?path=${encodeURIComponent(file.path)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setLinks(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, file.path]);

  const createShareLink = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: file.path,
          expires_in_hours: Number(expiryHours) || undefined,
          max_downloads: Number(maxDownloads) || undefined,
          password: password.trim() || undefined,
          notification_email: notificationEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }

      // Build share URL and copy to clipboard
      const shareUrl = `${window.location.origin}/share/${json.data.token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('تم إنشاء الرابط ونسخه');

      // Reset form
      setPassword('');
      setNotificationEmail('');
      setMaxDownloads('0');

      // Refresh links
      const refreshRes = await fetch(`/api/shares?path=${encodeURIComponent(file.path)}`);
      const refreshJson = await refreshRes.json();
      if (refreshJson.data) setLinks(refreshJson.data);
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setCreating(false);
    }
  };

  const deactivateLink = async (id: string) => {
    try {
      const res = await fetch(`/api/shares/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      const json = await res.json();
      if (json.error) { toast.error(json.error); return; }
      toast.success('تم إلغاء الرابط');
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch {
      toast.error('حدث خطأ');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            مشاركة الملف
          </DialogTitle>
          <DialogDescription>
            إنشاء رابط مشاركة عام لـ &quot;{decodeURIComponent(file.name)}&quot;
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new share link form */}
          <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">مدة الصلاحية</Label>
                <Select value={expiryHours} onValueChange={setExpiryHours}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">ساعة واحدة</SelectItem>
                    <SelectItem value="24">يوم واحد</SelectItem>
                    <SelectItem value="72">3 أيام</SelectItem>
                    <SelectItem value="168">أسبوع</SelectItem>
                    <SelectItem value="720">شهر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الحد الأقصى للتحميلات</Label>
                <Select value={maxDownloads} onValueChange={setMaxDownloads}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">غير محدود</SelectItem>
                    <SelectItem value="1">مرة واحدة</SelectItem>
                    <SelectItem value="5">5 مرات</SelectItem>
                    <SelectItem value="10">10 مرات</SelectItem>
                    <SelectItem value="50">50 مرة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Lock className="h-3 w-3" />
                كلمة مرور (اختياري)
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة مرور لحماية الرابط"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Bell className="h-3 w-3" />
                بريد الإشعار عند التحميل (اختياري)
              </Label>
              <Input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="example@email.com"
                className="h-9"
                dir="ltr"
              />
            </div>

            <Button
              onClick={createShareLink}
              disabled={creating}
              className="w-full"
              size="sm"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 me-1 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 me-1" />
              )}
              {creating ? 'جاري الإنشاء...' : 'إنشاء رابط ونسخه'}
            </Button>
          </div>

          {/* Existing links */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : links.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">الروابط النشطة ({links.length})</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-2 p-2.5 border rounded-lg text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-muted-foreground">
                          {new Date(link.expires_at) > new Date() ? (
                            <>ينتهي: {new Date(link.expires_at).toLocaleDateString('ar-SA')}</>
                          ) : (
                            <span className="text-destructive">منتهي</span>
                          )}
                        </span>
                        {link.has_password && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            <Lock className="h-2.5 w-2.5 me-0.5" />
                            محمي
                          </Badge>
                        )}
                        {link.notification_email && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            <Bell className="h-2.5 w-2.5 me-0.5" />
                            إشعار
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        تحميلات: {link.access_count}
                        {link.max_access > 0 && ` / ${link.max_access}`}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                      onClick={() => deactivateLink(link.id)}
                      title="إلغاء الرابط"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── File Context Menu ──────────────────────────────────────

export function FileContextMenu({
  file,
  children,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopyPath,
  onPermissions,
  isAdmin,
}: FileContextMenuProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const { data: favorites = [] } = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const isFavorited = favorites.some((f) => f.file_path === file.path);

  const decodedName = decodeURIComponent(file.name);

  const handleRenameOpen = () => {
    setNewName(decodedName);
    setRenameOpen(true);
  };

  const handleRenameConfirm = () => {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== decodedName) {
      onRename(file, trimmed);
    }
    setRenameOpen(false);
  };

  const handleDeleteConfirm = () => {
    onDelete(file);
    setDeleteOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!file.isFolder && (
            <DropdownMenuItem onClick={() => onPreview(file)}>
              <Eye className="me-2 h-4 w-4" />
              معاينة
            </DropdownMenuItem>
          )}
          {!file.isFolder && (
            <DropdownMenuItem onClick={() => onDownload(file)}>
              <Download className="me-2 h-4 w-4" />
              تحميل
            </DropdownMenuItem>
          )}
          {!file.isFolder && (
            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Link2 className="me-2 h-4 w-4" />
              مشاركة
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRenameOpen}>
            <Pencil className="me-2 h-4 w-4" />
            إعادة تسمية
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopyPath(file)}>
            <Copy className="me-2 h-4 w-4" />
            نسخ المسار
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              toggleFavorite.mutate({
                filePath: file.path,
                itemType: file.isFolder ? 'folder' : 'file',
                displayName: decodedName,
              })
            }
          >
            <Star
              className={`me-2 h-4 w-4 ${isFavorited ? 'fill-yellow-400 text-yellow-500' : ''}`}
            />
            {isFavorited ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTagsOpen(true)}>
            <Tags className="me-2 h-4 w-4" />
            وسوم
          </DropdownMenuItem>
          {isAdmin && onPermissions && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPermissions(file)}>
                <Shield className="me-2 h-4 w-4" />
                صلاحيات
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="me-2 h-4 w-4" />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة تسمية</DialogTitle>
            <DialogDescription>
              أدخل الاسم الجديد لـ &quot;{decodedName}&quot;
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
            }}
            autoFocus
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleRenameConfirm} disabled={!newName.trim()}>
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف &quot;{decodedName}&quot;؟ سيتم نقله إلى سلة المحذوفات.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tags Dialog */}
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent className="sm:max-w-xs p-0 overflow-visible">
          <div className="p-1">
            <FileTagsPopover filePath={file.path} embedded />
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {!file.isFolder && (
        <ShareDialog file={file} open={shareOpen} onOpenChange={setShareOpen} />
      )}
    </>
  );
}

// Inline action button for grid/list views
export function FileActionButton({
  file,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onCopyPath,
  onPermissions,
  isAdmin,
}: Omit<FileContextMenuProps, 'children'>) {
  return (
    <FileContextMenu
      file={file}
      onPreview={onPreview}
      onDownload={onDownload}
      onRename={onRename}
      onDelete={onDelete}
      onCopyPath={onCopyPath}
      onPermissions={onPermissions}
      isAdmin={isAdmin}
    >
      <button
        onClick={(e) => e.stopPropagation()}
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
      >
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>
    </FileContextMenu>
  );
}

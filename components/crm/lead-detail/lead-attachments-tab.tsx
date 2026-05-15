'use client';

/**
 * Lead Attachments tab (Phase 15.2 Commit 1).
 *
 * Replaces the previous LeadFilesTab placeholder. Provides camera + gallery
 * upload UI for per-lead images, a responsive grid view of attachments,
 * and a Sheet detail panel matching the Phase 10 / Phase 14.1 pattern.
 *
 * Pipeline:
 *   1. User taps "📷 كاميرا" → native camera (iOS/Android via capture=environment)
 *      OR taps "🖼️ معرض الصور" → multi-select gallery
 *   2. For EACH selected file:
 *      a. Client Canvas resize (lib/utils/image-resize) — 1920×1920 max,
 *         JPEG 0.82, EXIF stripped as side effect
 *      b. Upload Blob via FormData to POST /api/crm/leads/[id]/attachments
 *      c. On success: invalidate query → grid re-fetches
 *      d. On error (5MB/cap/MIME): Arabic toast
 *   3. Click any thumbnail → opens Sheet with full-size image + metadata
 *      + delete button (admin OR uploader only).
 *
 * Constraints (server-enforced — UI mirrors for fast feedback):
 *   - 5 MB per file (after resize)
 *   - 10 images per lead
 *   - MIME: jpg/jpeg/png/webp/heic/heif
 *
 * Touch targets: h-11 (44px) per Phase 10 mobile standard.
 */

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Camera,
  ImagePlus,
  ImageIcon,
  Loader2,
  Trash2,
  Download,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, formatDate } from '@/lib/utils/format';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useLeadAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '@/hooks/useLeadAttachments';
import { resizeImageForUpload, blobToFile } from '@/lib/utils/image-resize';
import type { PyraLeadAttachment } from '@/types/database';

const MAX_PER_LEAD = 10;

export function LeadAttachmentsTab({ leadId }: { leadId: string }) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [selected, setSelected] = useState<PyraLeadAttachment | null>(null);

  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useLeadAttachments(leadId);
  const attachments = data?.attachments ?? [];
  const remaining = Math.max(0, MAX_PER_LEAD - attachments.length);
  const atCap = attachments.length >= MAX_PER_LEAD;

  const uploadMutation = useUploadAttachment(leadId);
  const deleteMutation = useDeleteAttachment(leadId);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArr = Array.from(files);
    // Trim if user picked more than remaining slots — toast a warning so
    // they know we silently dropped some. (UI also disables buttons at
    // cap, but the file picker can still return N > remaining if user
    // clicks a stale state.)
    const toUpload = fileArr.slice(0, remaining);
    if (toUpload.length < fileArr.length) {
      toast.warning(
        `تم تجاهل ${fileArr.length - toUpload.length} ملف — الحد الأقصى ${MAX_PER_LEAD} صور لكل Lead`,
      );
    }

    setUploadingCount((c) => c + toUpload.length);

    // Sequential upload — keeps per-file progress simple and avoids
    // racing the per-lead cap check on the server.
    for (const file of toUpload) {
      try {
        // 1. Client-side resize + EXIF strip
        const resized = await resizeImageForUpload(file);
        const resizedFile = blobToFile(resized.blob, file.name);

        // 2. Upload
        await uploadMutation.mutateAsync(resizedFile);
      } catch (err) {
        console.error('upload failed for', file.name, err);
        const msg =
          err instanceof Error && err.message
            ? err.message
            : `فشل رفع "${file.name}"`;
        toast.error(msg);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  }

  async function handleDelete(att: PyraLeadAttachment) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الصورة؟ لا يمكن التراجع.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(att.id);
      toast.success('تم الحذف');
      // If the sheet showed this attachment, close it.
      if (selected?.id === att.id) setSelected(null);
    } catch (err) {
      console.error('delete failed', err);
      const msg = err instanceof Error ? err.message : 'فشل الحذف';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Action bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-2 flex-1">
          <Button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={atCap || uploadingCount > 0}
            className="h-11 flex-1 gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Camera className="size-4" />
            كاميرا
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => galleryInputRef.current?.click()}
            disabled={atCap || uploadingCount > 0}
            className="h-11 flex-1 gap-2"
          >
            <ImagePlus className="size-4" />
            معرض الصور
          </Button>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {attachments.length} / {MAX_PER_LEAD} صور
          </span>
          {uploadingCount > 0 && (
            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <Loader2 className="size-3.5 animate-spin" />
              جاري رفع {uploadingCount}…
            </span>
          )}
        </div>
      </div>

      {/* Camera input — `capture=environment` triggers rear camera on mobile.
          accept=image/* widens to all image types the browser knows. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const files = e.target.files;
          void handleFiles(files);
          // Reset so picking the same file twice in a row re-fires onChange.
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Gallery input — multi-select. HEIC/HEIF explicitly added because
          older iOS Safari doesn't include them in image/* by default. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={(e) => {
          const files = e.target.files;
          void handleFiles(files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Cap warning banner */}
      {atCap && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <p>
            تم بلوغ الحد الأقصى للمرفقات ({MAX_PER_LEAD} صور). احذف صور قديمة
            لإضافة جديدة.
          </p>
        </div>
      )}

      {/* ── Grid / Empty / Loading ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </div>
      ) : attachments.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="لا توجد مرفقات بعد"
          description="استخدم زر الكاميرا لالتقاط صورة، أو زر معرض الصور لاختيار صور موجودة. الـ EXIF (موقع GPS وبيانات الكاميرا) بيتم حذفها تلقائياً قبل الرفع."
        />
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {attachments.map((att) => (
            <li key={att.id}>
              <button
                type="button"
                onClick={() => setSelected(att)}
                className={cn(
                  'group relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted/30',
                  'hover:border-orange-300 dark:hover:border-orange-700/60 hover:shadow-sm transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500',
                )}
                aria-label={`صورة مرفقة — ${formatRelativeDate(att.uploaded_at)}`}
              >
                {att.public_url ? (
                  // Use plain <img>; Supabase URLs don't benefit from
                  // next/image optimization for the static-bucket case.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.public_url}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-6" />
                  </div>
                )}
                {/* Hover/focus overlay with relative time */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <span className="text-[10px] text-white tabular-nums">
                    {formatRelativeDate(att.uploaded_at)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Detail Sheet (Phase 10 RTL pattern: side="right" = visual LEFT) ── */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <AttachmentDetailPanel
              attachment={selected}
              isAdmin={isAdmin}
              currentUsername={user?.username ?? null}
              onDelete={() => void handleDelete(selected)}
              deleting={deleteMutation.isPending}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────

function AttachmentDetailPanel({
  attachment,
  isAdmin,
  currentUsername,
  onDelete,
  deleting,
}: {
  attachment: PyraLeadAttachment;
  isAdmin: boolean;
  currentUsername: string | null;
  onDelete: () => void;
  deleting: boolean;
}) {
  const canDelete = isAdmin || attachment.uploaded_by === currentUsername;
  const sizeKb = (attachment.size_bytes / 1024).toFixed(1);
  const sizeMb = (attachment.size_bytes / 1024 / 1024).toFixed(2);
  const sizeLabel =
    attachment.size_bytes >= 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

  return (
    <>
      <SheetHeader className="space-y-2 text-start">
        <SheetTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="size-5 text-orange-500" />
          صورة مرفقة
        </SheetTitle>
        <SheetDescription className="text-xs">
          {formatDate(attachment.uploaded_at, 'eeee dd-MM-yyyy HH:mm')}
        </SheetDescription>
      </SheetHeader>

      {attachment.public_url && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.public_url}
            alt="مرفق"
            className="w-full h-auto max-h-[60vh] object-contain bg-black/5"
          />
        </div>
      )}

      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <dt className="text-muted-foreground w-24 shrink-0">رفعها</dt>
          <dd className="font-medium">@{attachment.uploaded_by}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="text-muted-foreground w-24 shrink-0">الحجم</dt>
          <dd className="font-medium tabular-nums">{sizeLabel}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="text-muted-foreground w-24 shrink-0">النوع</dt>
          <dd className="font-mono text-[11px]">{attachment.mime_type}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-col gap-2">
        {attachment.public_url && (
          <Button asChild variant="outline" className="h-11 gap-2 w-full">
            <a href={attachment.public_url} target="_blank" rel="noopener noreferrer">
              <Download className="size-4" />
              فتح الصورة الأصلية
            </a>
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={deleting}
            className="h-11 gap-2 w-full text-red-600 dark:text-red-400 hover:bg-red-500/10 border-red-200 dark:border-red-800/40"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            حذف الصورة
          </Button>
        )}
      </div>
    </>
  );
}

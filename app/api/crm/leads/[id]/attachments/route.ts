import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import type { PyraLeadAttachment } from '@/types/database';

// ────────────────────────────────────────────────────────────────────────────
// /api/crm/leads/[id]/attachments
//
// Phase 15.2 Commit 1 — per-lead image attachments. Camera + gallery uploads
// from the "مرفقات" tab in lead detail.
//
// Permission contract:
//   GET   leads.view   + canAccessLead   (sales agent sees their own; admin all)
//   POST  leads.update + canAccessLead   (same gate as PATCH lead route)
//
// Hard caps (Q-B-005 + plan deliverable F):
//   - 5 MB per file (after client Canvas resize — server enforces the
//     ceiling defensively because a malicious client could skip the resize)
//   - 10 image attachments per lead (server SELECT COUNT pre-check; a
//     concurrent-upload race could let the 11th sneak through — acceptable
//     for v1)
//   - MIME allowlist: image/jpeg, image/png, image/webp, image/heic, image/heif
//   - Extension allowlist: .jpg, .jpeg, .png, .webp, .heic, .heif
//   - SVG is REJECTED (XSS via embedded <script>)
//
// Storage:
//   - Bucket: pyraai-workspace (existing, public, 500MB cap)
//   - Path:   lead-attachments/{lead_id}/{ts}-{nanoid}.{ext}
//   - Server generates the FULL path — user has zero control (no traversal)
//   - upsert: false — paths are unique by construction, but defense in depth
//
// Activity dual-write (Phase 11.5 locked pattern):
//   - pyra_lead_activities row (timeline)  — activity_type='attachment_added'
//   - pyra_activity_log row (system audit) — action_type='lead_update',
//                                             metadata.source='attachment_added'
// ────────────────────────────────────────────────────────────────────────────

// Gap #3 Phase 3a — lead attachments hold client PII, so they live in a PRIVATE
// bucket and are served via short-lived signed URLs. Hardcoded (NOT the
// env-overridable public bucket) so the private target can't be misconfigured away.
const LEAD_ATTACH_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (parity for both file types)
const MAX_PER_LEAD = 10;
/** Phase 15.2 Commit 2 — hard cap on voice-note duration. Mirrors the
 *  client-side useVoiceRecorder MAX_DURATION_SEC. */
const MAX_VOICE_DURATION_SEC = 300; // 5 minutes

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

/** Phase 15.2 Commit 2 — voice note MIME allowlist. webm preferred
 *  (Chrome/Firefox/Android); mp4 fallback (Safari/iOS); ogg + mpeg
 *  for breadth. NO arbitrary audio/* — explicit list only. */
const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
]);
const ALLOWED_AUDIO_EXT = new Set(['.webm', '.m4a', '.mp4', '.ogg', '.mp3']);

// Map MIME → canonical file extension. Client Canvas resize re-encodes to
// image/jpeg → .jpg. Voice recorder picks webm or mp4 based on browser
// support (Safari falls back to mp4). Other types only appear when client
// skipped resize (defensive — accept but normalize the extension to match
// the MIME).
const MIME_TO_EXT: Record<string, string> = {
  // image
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  // voice
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
};

type FileTypeKind = 'image' | 'voice_note';

// ──────────────────────────────────────────────────────────────────────────
// GET — list attachments for a lead
// ──────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId } = await params;
    leadIdForLogging = leadId;

    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const { data, error } = await supabase
      .from('pyra_lead_attachments')
      .select(
        'id, lead_id, file_type, storage_path, mime_type, size_bytes, duration_seconds, uploaded_by, uploaded_at, metadata',
      )
      .eq('lead_id', leadId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'list-attachments' },
      });
      console.error('list attachments error:', error.message);
      return apiServerError();
    }

    // Generate a short-lived SIGNED URL per row at read time (bucket is private).
    // Field stays `public_url` so the viewer is unchanged — it just holds a
    // time-limited signed URL now. Fresh per GET; the viewer refetches on error.
    const attachments: PyraLeadAttachment[] = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: urlData } = await supabase.storage
          .from(LEAD_ATTACH_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
        return { ...(row as PyraLeadAttachment), public_url: urlData?.signedUrl ?? '' };
      }),
    );

    return apiSuccess({ attachments });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'list-attachments' },
    });
    console.error('GET /api/crm/leads/[id]/attachments threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// POST — upload one image attachment
// ──────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  let leadIdForLogging: string | null = null;
  try {
    // Layer 1 — rate limit (Phase 14.1 + uploadLimiter: 20/min/IP)
    const limited = checkRateLimit(uploadLimiter, request);
    if (limited) return limited;

    // Layer 2 — permission
    const auth = await requireApiPermission('leads.update');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id: leadId } = await params;
    leadIdForLogging = leadId;

    const supabase = createServiceRoleClient();

    // Layer 3 — scope (admin OR assigned_to == self)
    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // Layer 4 — multipart body
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return apiValidationError('الملف مطلوب');
    }

    // Phase 15.2 Commit 2 — file_type form field branches the validation
    // path. Defaults to 'image' for backwards-compat (Commit 1 clients
    // didn't send this field). 'voice_note' enables audio MIME + duration
    // validation; anything else is rejected.
    const rawFileType = form.get('file_type');
    const fileType: FileTypeKind =
      typeof rawFileType === 'string' && rawFileType === 'voice_note'
        ? 'voice_note'
        : 'image';

    // Layer 5 — size (defensive — client resizes/caps; server enforces)
    if (file.size <= 0) return apiValidationError('الملف فارغ');
    if (file.size > MAX_FILE_SIZE) {
      return apiError(
        `حجم الملف يتجاوز الحد الأقصى (5 ميجابايت). حجم الملف الحالي: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
        413,
      );
    }

    // Layer 6 — MIME allowlist (per file_type).
    // Images: SVG explicitly REJECTED (XSS via embedded <script>).
    // Voice: explicit allowlist (audio/webm preferred, audio/mp4 Safari
    // fallback, audio/ogg + audio/mpeg for breadth). NO arbitrary audio/*.
    const allowedMimeForType =
      fileType === 'image' ? ALLOWED_IMAGE_MIME : ALLOWED_AUDIO_MIME;
    if (!allowedMimeForType.has(file.type)) {
      const list =
        fileType === 'image'
          ? 'JPG, PNG, WebP, HEIC'
          : 'WebM, M4A/MP4 audio, OGG, MP3';
      return apiError(
        `نوع الملف "${file.type}" غير مدعوم. الأنواع المسموح بها: ${list}`,
        415,
      );
    }

    // Layer 7 — Extension allowlist (defense in depth)
    const allowedExtForType =
      fileType === 'image' ? ALLOWED_IMAGE_EXT : ALLOWED_AUDIO_EXT;
    const originalName = file.name || 'upload';
    const lastDot = originalName.lastIndexOf('.');
    const rawExt = lastDot > 0 ? originalName.slice(lastDot).toLowerCase() : '';
    if (!allowedExtForType.has(rawExt)) {
      const list =
        fileType === 'image'
          ? '.jpg, .jpeg, .png, .webp, .heic, .heif'
          : '.webm, .m4a, .mp4, .ogg, .mp3';
      return apiError(
        `امتداد الملف "${rawExt || '(لا يوجد)'}" غير مدعوم. الامتدادات المسموح بها: ${list}`,
        415,
      );
    }

    // Layer 7b — voice-note duration cap (Phase 15.2 Commit 2).
    // Client useVoiceRecorder auto-stops at 5 min and sends
    // duration_seconds in the FormData. Server validates the value
    // matches expectations (defensive — malicious client could skip
    // the auto-stop and send a 30-minute recording).
    let durationSeconds: number | null = null;
    if (fileType === 'voice_note') {
      const rawDuration = form.get('duration_seconds');
      const parsed =
        typeof rawDuration === 'string' ? parseInt(rawDuration, 10) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return apiValidationError(
          'duration_seconds مطلوب للملاحظات الصوتية (رقم بالثواني)',
        );
      }
      if (parsed > MAX_VOICE_DURATION_SEC) {
        return apiError(
          `الحد الأقصى لمدة التسجيل ${MAX_VOICE_DURATION_SEC / 60} دقائق. المدة المرسلة: ${parsed} ثانية`,
          422,
        );
      }
      durationSeconds = parsed;
    }

    // Layer 8 — per-lead count cap (Q-B-005). Cap covers BOTH file types
    // combined — total attachments per lead ≤ 10 (Q1(a) lock: mixed grid,
    // shared cap). Voice notes count against the same budget as images.
    const { count: existingCount, error: countError } = await supabase
      .from('pyra_lead_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId);

    if (countError) {
      logError({
        error: countError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'upload-attachment', stage: 'count_check' },
      });
      console.error('count check failed:', countError.message);
      return apiServerError();
    }

    if ((existingCount ?? 0) >= MAX_PER_LEAD) {
      return apiError(
        `تم بلوغ الحد الأقصى للمرفقات (${MAX_PER_LEAD} مرفقات لكل Lead). احذف مرفقات قديمة قبل إضافة جديدة.`,
        422,
      );
    }

    // Layer 9 — server-generated storage path (NO user control over the path,
    // prevents traversal entirely). Extension derived from validated MIME
    // (not from filename) for consistency with the actual byte content.
    //
    // Reviewer flagged the earlier `?? rawExt` fallback as a latent
    // path-traversal vector: if a future ALLOWED_MIME entry is added without
    // a matching MIME_TO_EXT entry, the user-supplied filename extension
    // would leak into the storage path. With ALLOWED_MIME and MIME_TO_EXT
    // sized identically (5 entries each), the lookup CANNOT miss in v1, but
    // we hard-error on a miss to preserve the invariant "storage path is
    // 100% server-controlled" against future maintenance drift.
    const canonicalExt = MIME_TO_EXT[file.type];
    if (!canonicalExt) {
      logError({
        error: new Error(`MIME_TO_EXT missing entry for ${file.type}`),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'upload-attachment', stage: 'canonical_ext_lookup', mime: file.type },
      });
      return apiServerError('خطأ داخلي في تحديد نوع الملف');
    }
    // ID prefix matches the file_type for at-a-glance debugging of bucket
    // listings. Both prefixes resolve to the same generateId() length.
    const idPrefix = fileType === 'image' ? 'img' : 'voc';
    const storagePath = `lead-attachments/${leadId}/${Date.now()}-${generateId(idPrefix).slice(4)}${canonicalExt}`;

    // Layer 10 — upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(LEAD_ATTACH_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      logError({
        error: uploadError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'upload-attachment', stage: 'storage_upload', file_type: fileType },
      });
      console.error('storage upload error:', uploadError.message);
      const label = fileType === 'voice_note' ? 'الملاحظة الصوتية' : 'الصورة';
      return apiServerError(`فشل رفع ${label}: ${uploadError.message}`);
    }

    // Layer 11 — DB row
    const attachmentId = generateId('att');
    const { data: inserted, error: insertError } = await supabase
      .from('pyra_lead_attachments')
      .insert({
        id: attachmentId,
        lead_id: leadId,
        file_type: fileType,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        duration_seconds: durationSeconds,
        uploaded_by: auth.pyraUser.username,
      })
      .select(
        'id, lead_id, file_type, storage_path, mime_type, size_bytes, duration_seconds, uploaded_by, uploaded_at, metadata',
      )
      .single();

    if (insertError || !inserted) {
      // Storage upload succeeded but DB insert failed — orphan the file.
      // Best-effort cleanup to avoid storage bloat.
      void supabase.storage.from(LEAD_ATTACH_BUCKET).remove([storagePath]);
      logError({
        error: insertError ?? new Error('attachment insert returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'upload-attachment', stage: 'db_insert' },
      });
      console.error('attachment insert failed:', insertError?.message);
      return apiServerError('فشل تسجيل المرفق');
    }

    // Layer 12 — short-lived signed URL (private bucket)
    const { data: urlData } = await supabase.storage
      .from(LEAD_ATTACH_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);
    const publicUrl = urlData?.signedUrl ?? '';

    // Layer 13 — Lead timeline activity (visible in activity tab).
    // Uses Supabase query-builder .then() per the lazy-thenable convention.
    supabase
      .from('pyra_lead_activities')
      .insert({
        id: generateId('la'),
        lead_id: leadId,
        activity_type: 'attachment_added',
        description:
          fileType === 'voice_note'
            ? 'تم إضافة ملاحظة صوتية جديدة'
            : 'تم إضافة مرفق جديد',
        metadata: {
          attachment_id: attachmentId,
          file_type: fileType,
          size_bytes: file.size,
          mime_type: file.type,
          ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
        },
        created_by: auth.pyraUser.username,
      })
      .then(({ error: e }) => {
        if (e) console.error('[attachment timeline] insert failed:', e.message);
      });

    // Layer 14 — System audit log (Phase 11.5 locked pattern)
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      {
        lead_id: leadId,
        source: 'attachment_added',
        attachment_id: attachmentId,
        file_type: fileType,
        size_bytes: file.size,
        ...(durationSeconds !== null ? { duration_seconds: durationSeconds } : {}),
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess(
      { attachment: { ...(inserted as PyraLeadAttachment), public_url: publicUrl }, public_url: publicUrl },
      undefined,
      201,
    );
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { lead_id: leadIdForLogging, action: 'upload-attachment' },
    });
    console.error('POST /api/crm/leads/[id]/attachments threw:', err);
    return apiServerError();
  }
}

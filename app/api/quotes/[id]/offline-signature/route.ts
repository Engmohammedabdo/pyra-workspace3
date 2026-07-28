import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiError,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope, type UserScope } from '@/lib/auth/scope';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { validateEvidenceFile, isPdfMagic, MAX_EVIDENCE_BYTES } from '@/lib/quotes/evidence-upload';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notify } from '@/lib/notifications/notify';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/quotes/[id]/offline-signature
//
// Records a signature obtained OUTSIDE the system — the customer signed the
// PDF quote we emailed or handed over on paper, and an internal user is now
// attesting to that fact with the counter-signed file as evidence.
//
// Gated: quotes.edit (same three-way scope as GET/PATCH/DELETE/link — own
// quote OR a lead-owned quote OR a quote for a client in scope).
//
// Storage — Gap #3 Phase 3a pattern, same as app/api/hr/documents/route.ts:
//   Bucket:  pyra-private (private, NOT pyraai-workspace)
//   Path:    quote-evidence/{quote_id}/{ts}-{nanoid}.{ext}
//   Server controls 100% of the path — user-supplied filename NEVER used
//
// Hard caps (lib/quotes/evidence-upload.ts, Task 1 — shared with the public
// signing flow's evidence, NOT the 20 MB the HR upload dialog advertises —
// the pyra-private BUCKET limit is 10 MiB):
//   MAX_EVIDENCE_BYTES per file
//   MIME allowlist: PDF, JPEG, PNG, WebP (SVG rejected — XSS vector)
//   PDF uploads are additionally verified by magic bytes, not the
//   client-supplied MIME type — no other upload route in this repo does
//   content sniffing, but this is legal evidence.
//
// signed_offline_by is ALWAYS auth.pyraUser.username — the request body is
// never read for it (S-26). The whole point of this record is that it names
// who vouched for the signature; trusting the caller for that would make the
// record worthless.
//
// The append-only trigger (migrations 054/055) means a SECOND write to any
// signature/evidence column on an already-attested quote raises at the DB
// level — the status guard below runs BEFORE any upload so that failure mode
// is a clean 422, never an opaque 500.
//
// Post-upload invariant: orphan cleanup — storage remove on DB-update failure
// or on a lost race (someone else signed the quote between our read and the
// conditional update).
// ────────────────────────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> };

type QuoteScopeRow = { client_id: string | null; lead_id: string | null; created_by: string | null };

const EVIDENCE_BUCKET = 'pyra-private';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a REAL calendar date, not just a `YYYY-MM-DD`-shaped string.
 * `DATE_ONLY` alone lets `2026-13-40` through — it would otherwise reach
 * Postgres and surface as the generic `offlineUpdateFailed` message instead
 * of a clean 422. `Date.UTC` normalizes overflow (month 13 rolls into next
 * year, day 40 rolls past month-end), so round-tripping and comparing
 * catches both single-field and compound overflow (e.g. Feb 30, Apr 31,
 * Feb 29 on a non-leap year).
 */
function isRealCalendarDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Only 'sent'/'viewed' quotes were ever actually given to a customer to sign —
// draft/pending_approval have nothing to counter-sign, and signed/invoiced are
// refused explicitly below with a friendlier message.
const ATTESTABLE_STATUSES: readonly string[] = [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED];

/** Same three-way scope as app/api/quotes/[id]/link/route.ts. */
async function canAttestQuote(
  supabase: SupabaseClient,
  scope: UserScope,
  auth: ApiAuthResult,
  quote: QuoteScopeRow,
): Promise<boolean> {
  if (scope.isAdmin) return true;
  const me = auth.pyraUser.username;
  const ownsQuote = quote.created_by === me;
  const inClientScope = !!quote.client_id && scope.clientIds.some((c) => String(c) === quote.client_id);
  const ownsLead = !!quote.lead_id && (await canAccessLead(supabase, me, auth.pyraUser.role, quote.lead_id));
  return ownsQuote || inClientScope || ownsLead;
}

export async function POST(request: NextRequest, context: RouteContext) {
  let authForLogging: ApiAuthResult | null = null;
  let storagePathForCleanup: string | null = null;
  let quoteIdForLogging: string | null = null;
  try {
    const limited = checkRateLimit(uploadLimiter, request);
    if (limited) return limited;

    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;
    authForLogging = auth;
    const t = await getTranslations('api');

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    quoteIdForLogging = id;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, quote_number, status, client_id, lead_id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (!quote) return apiNotFound(t('quotes.notFound'));
    if (!(await canAttestQuote(supabase, scope, auth, quote))) return apiForbidden();

    // Guard BEFORE touching FormData/storage — an already-attested quote must
    // fail here with a clean 422, never reach the append-only trigger.
    if (quote.status === QUOTE_STATUS.SIGNED || quote.status === QUOTE_STATUS.INVOICED) {
      return apiValidationError(t('quotes.offlineAlreadySigned'));
    }
    if (!ATTESTABLE_STATUSES.includes(quote.status)) {
      return apiValidationError(t('quotes.offlineWrongStatus', { status: quote.status }));
    }

    // Content-Length pre-check BEFORE parsing the body: Next.js's own
    // multipart parser throws for an oversized body (confirmed live — an
    // 11 MB upload raised `TypeError: Failed to parse body as FormData`
    // inside request.formData() itself, before validateEvidenceFile() ever
    // ran), which would otherwise surface as an opaque 500 — exactly the
    // failure mode verification (c) rules out. A 64 KiB margin covers
    // multipart boundary/field overhead so this never false-positives on a
    // genuinely small evidence file.
    //
    // Decision on an ABSENT/unparseable Content-Length (e.g. chunked
    // transfer, which never sets it): let it through to the parse guard
    // below rather than reject outright. `Number(header ?? 0)` used to make
    // that fall through by accident (0 is never > the cap, and so is NaN
    // from a garbage header) — it is now explicit via `contentLength ===
    // null` / `Number.isNaN`. Rejecting a missing header outright would also
    // reject every legitimate chunked/streamed request, and this route has
    // no way to tell those apart from an attacker at the header-check stage
    // — the actual backstop for that case is the try/catch around
    // `request.formData()` a few lines down, which turns the parser's own
    // rejection of an oversized body into the same clean 413. That backstop
    // still has to buffer the body before it can fail (see verification (c)
    // in the task-8 report) — this pre-check is a fast-path for the common,
    // honest case where Content-Length is present, not a substitute for it.
    const contentLengthHeader = request.headers.get('content-length');
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
    const tooLargeMessage = t('quotes.offlineFileTooLarge', {
      maxMb: (MAX_EVIDENCE_BYTES / 1024 / 1024).toFixed(0),
    });
    if (
      contentLength !== null &&
      !Number.isNaN(contentLength) &&
      contentLength > MAX_EVIDENCE_BYTES + 64 * 1024
    ) {
      return apiError(tooLargeMessage, 413);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (parseErr) {
      // No/incorrect Content-Length (e.g. chunked transfer) slipped past the
      // pre-check above and the parser itself rejected the body. Same
      // rationale as validateEvidenceFile's 'too_large' branch below — clean
      // 413, not the generic apiServerError() the outer catch would give.
      logError({
        error: parseErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'quote_offline_signature', stage: 'formdata_parse', quote_id: id },
      });
      return apiError(tooLargeMessage, 413);
    }
    const file = form.get('file');
    const signedByRaw = form.get('signed_by');
    const signedAtRaw = form.get('signed_at');
    // signed_offline_by is intentionally NEVER read from the form — even if a
    // caller includes it, it is ignored. See auth.pyraUser.username below (S-26).

    if (!(file instanceof File)) return apiValidationError(t('quotes.offlineFileRequired'));
    if (file.size <= 0) return apiValidationError(t('quotes.offlineFileEmpty'));
    if (typeof signedByRaw !== 'string' || !signedByRaw.trim()) {
      return apiValidationError(t('quotes.offlineSignedByRequired'));
    }
    if (
      typeof signedAtRaw !== 'string' ||
      !DATE_ONLY.test(signedAtRaw) ||
      !isRealCalendarDate(signedAtRaw)
    ) {
      return apiValidationError(t('quotes.offlineSignedAtInvalid'));
    }
    if (signedAtRaw > dubaiDayKey()) {
      return apiValidationError(t('quotes.offlineSignedAtFuture'));
    }

    const signerName = signedByRaw.trim();

    const validated = validateEvidenceFile({ type: file.type, size: file.size });
    if (!validated.ok) {
      if (validated.reason === 'too_large') {
        return apiError(tooLargeMessage, 413);
      }
      return apiError(t('quotes.offlineFileMimeUnsupported', { mime: file.type }), 415);
    }

    // Content sniffing: file.type is client-supplied and trivially spoofed by
    // renaming an .svg to .pdf. Only PDFs are sniffed — evidence-upload.ts
    // does not ship a magic-byte check for the image MIMEs.
    if (file.type === 'application/pdf') {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!isPdfMagic(head)) {
        return apiValidationError(t('quotes.offlineFileNotPdf'));
      }
    }

    // Server-generated storage path (zero user control) — mirrors
    // app/api/hr/documents/route.ts's convention.
    const storagePath = `quote-evidence/${id}/${Date.now()}-${generateId('ev').slice(3)}.${validated.ext}`;
    storagePathForCleanup = storagePath;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      storagePathForCleanup = null; // nothing was actually written — no orphan to clean up
      logError({
        error: uploadError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'quote_offline_signature', stage: 'storage_upload', quote_id: id },
      });
      return apiServerError(t('quotes.offlineUploadFailed', { message: uploadError.message }));
    }

    const signedAtIso = `${signedAtRaw}T00:00:00.000Z`;
    const now = new Date().toISOString();

    // Race-safe conditional update — same shape as lib/quotes/sign-quote.ts's
    // `.in('status', [...])` guard: if someone else signed this quote between
    // our read above and this write, `updated` comes back null with NO error,
    // and that must read as "already signed", not a 500.
    const { data: updated, error: updateError } = await supabase
      .from('pyra_quotes')
      .update({
        status: QUOTE_STATUS.SIGNED,
        signature_source: 'offline',
        signed_by: signerName,
        signed_at: signedAtIso, // typed by the admin — when the CUSTOMER signed
        signed_offline_by: auth.pyraUser.username, // NEVER from the body (S-26)
        signed_offline_at: now, // server clock — when this attestation happened
        signed_evidence_path: storagePath,
        signed_evidence_mime: file.type,
        signed_evidence_size: file.size,
        updated_at: now,
      })
      .eq('id', id)
      .in('status', ATTESTABLE_STATUSES)
      .select('id, quote_number, status, signed_by, signed_at, signed_offline_by, signed_offline_at')
      .maybeSingle();

    if (updateError || !updated) {
      // Storage succeeded but the DB write did not stick — orphan cleanup so
      // a failed/raced attestation never leaves a dangling file behind.
      // Supabase Storage's .remove() RESOLVES with `{ error }` rather than
      // throwing, so a fire-and-forget `void` call here means a failed
      // removal is invisible forever — the try/catch around this whole
      // handler catches nothing, and the PDF stays stranded in
      // pyra-private with no DB row pointing at it. Must be awaited and
      // checked.
      const { error: removeError } = await supabase.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
      if (removeError) {
        logError({
          error: removeError,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: {
            source: 'quote_offline_signature',
            stage: 'orphan_cleanup',
            quote_id: id,
            storage_path: storagePath,
          },
        });
      }

      if (!updateError) {
        // No error, no row — the conditional update matched nothing because
        // status was no longer sent/viewed by the time we wrote. Friendly
        // message, not a 500.
        return apiValidationError(t('quotes.offlineAlreadySigned'));
      }

      logError({
        error: updateError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'quote_offline_signature', stage: 'db_update', quote_id: id },
      });
      return apiServerError(t('quotes.offlineUpdateFailed'));
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quote_signed_offline',
      `/dashboard/quotes/${id}`,
      {
        quote_number: quote.quote_number,
        signed_by: signerName,
        size_bytes: file.size,
        mime_type: file.type,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    if (quote.created_by) {
      await notify(supabase, {
        to: quote.created_by,
        type: 'quote_signed',
        title: 'تم توقيع عرض السعر', // i18n-exempt: notification content (Phase 8)
        message: `تم تسجيل توقيع خارجي على عرض السعر ${quote.quote_number} بواسطة ${signerName}`, // i18n-exempt: notification content (Phase 8)
        link: `/dashboard/quotes/${id}`,
        entity: { type: 'quote', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    return apiSuccess(updated);
  } catch (err) {
    if (storagePathForCleanup) {
      // Same rationale as the DB-update-failure branch above: .remove()
      // resolves { error } instead of throwing, so it must be awaited and
      // checked — otherwise a failed removal here is silent too. The outer
      // try/catch is kept ONLY for the storage client itself throwing
      // (e.g. a network error constructing the request), which must never
      // mask the primary error `err` being handled below.
      try {
        const supabase = createServiceRoleClient();
        const { error: removeError } = await supabase.storage
          .from(EVIDENCE_BUCKET)
          .remove([storagePathForCleanup]);
        if (removeError) {
          logError({
            error: removeError,
            request,
            user: authForLogging
              ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
              : undefined,
            metadata: {
              source: 'quote_offline_signature',
              stage: 'orphan_cleanup_catch',
              quote_id: quoteIdForLogging ?? undefined,
              storage_path: storagePathForCleanup,
            },
          });
        }
      } catch (cleanupErr) {
        logError({
          error: cleanupErr,
          request,
          user: authForLogging
            ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
            : undefined,
          metadata: {
            source: 'quote_offline_signature',
            stage: 'orphan_cleanup_catch_threw',
            quote_id: quoteIdForLogging ?? undefined,
            storage_path: storagePathForCleanup,
          },
        });
      }
    }
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'quote_offline_signature' },
    });
    return apiServerError();
  }
}

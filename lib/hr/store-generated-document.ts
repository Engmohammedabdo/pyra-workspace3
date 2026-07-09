/**
 * lib/hr/store-generated-document.ts
 *
 * Shared helper that uploads a server-generated PDF to the private
 * `pyra-private` bucket under the `employee-documents/` prefix and inserts a
 * `pyra_employee_documents` row — mirroring the exact storage + insert logic
 * from `app/api/hr/documents` POST.
 *
 * Use this in API routes that programmatically generate documents (e.g. the
 * Employee Onboarding offer-letter generator) so they don't duplicate the
 * storage path construction, orphan-cleanup, or DB column contract.
 *
 * Server-only — uses a service-role SupabaseClient passed by the caller.
 * Caller is responsible for auth-gating before calling this helper.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

// ─────────────────────────────────────────────────────────────────────────────
// Constants — match app/api/hr/documents/route.ts exactly
// ─────────────────────────────────────────────────────────────────────────────

/** Private Supabase Storage bucket — NOT env-overridable (prevents
 *  misconfiguration to a public bucket). */
const DOC_BUCKET = 'pyra-private';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface StoreGeneratedDocumentOpts {
  /** Username of the employee the document belongs to. */
  employeeUsername: string;
  /** `pyra_document_types.id` FK. */
  typeId: string;
  /** Human-readable label stored in `pyra_employee_documents.label`. */
  label: string;
  /** Raw PDF bytes to upload. */
  pdf: Buffer;
  /** Username of the actor uploading the file (stored in `uploaded_by`). */
  uploadedBy: string;
}

export type StoreGeneratedDocumentResult =
  | { ok: true; storage_path: string; doc_id: string }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a generated PDF to `pyra-private` and insert a
 * `pyra_employee_documents` row.
 *
 * Storage path: `employee-documents/{employeeUsername}/{Date.now()}-{nanoid}.pdf`
 * (100% server-controlled — no user-supplied filename touches the path).
 *
 * Orphan cleanup: if the DB insert fails after a successful storage upload,
 * the uploaded object is removed before returning `{ok: false}`.
 *
 * @param serviceClient  Service-role Supabase client (RLS bypassed).
 * @param opts           See `StoreGeneratedDocumentOpts`.
 */
export async function storeGeneratedDocument(
  serviceClient: SupabaseClient,
  opts: StoreGeneratedDocumentOpts,
): Promise<StoreGeneratedDocumentResult> {
  const { employeeUsername, typeId, label, pdf, uploadedBy } = opts;

  // ── Build server-controlled storage path ─────────────────────────────────
  const storagePath = `employee-documents/${employeeUsername}/${Date.now()}-${generateId('doc').slice(4)}.pdf`;

  // ── Upload to private bucket ──────────────────────────────────────────────
  const { error: uploadError } = await serviceClient.storage
    .from(DOC_BUCKET)
    .upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false, // path is unique by construction — defense in depth
    });

  if (uploadError) {
    console.error('[storeGeneratedDocument] storage upload error:', uploadError.message);
    return { ok: false, error: `فشل رفع الملف: ${uploadError.message}` }; // i18n-exempt: internal — never surfaced verbatim to an HTTP caller on current call paths (see census)
  }

  // ── DB insert ─────────────────────────────────────────────────────────────
  const docId = generateId('doc');
  const { error: insertError } = await serviceClient
    .from('pyra_employee_documents')
    .insert({
      id: docId,
      employee_username: employeeUsername,
      type_id: typeId,
      label,
      storage_path: storagePath,
      mime_type: 'application/pdf',
      size_bytes: pdf.length,
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    });

  if (insertError) {
    // Orphan cleanup — remove the uploaded storage object before returning error
    void serviceClient.storage.from(DOC_BUCKET).remove([storagePath]);
    console.error('[storeGeneratedDocument] DB insert error:', insertError.message);
    return { ok: false, error: `فشل تسجيل الوثيقة: ${insertError.message}` }; // i18n-exempt: internal — never surfaced verbatim to an HTTP caller on current call paths (see census)
  }

  return { ok: true, storage_path: storagePath, doc_id: docId };
}

-- ────────────────────────────────────────────────────────────────────────────
-- Migration 016 — pyra_lead_attachments (Phase 15.2 Commit 1)
--
-- Per-lead image (+ voice in Commit 2) attachments. Camera + gallery uploads
-- from the new "مرفقات" tab in lead detail. Mobile-first PWA use case
-- (Sayed on iOS — HEIC support required client-side, transparently converted
-- to JPEG via Canvas resize before upload).
--
-- Design:
--   - VARCHAR PK (generateId('att')) matching workspace convention
--   - FK to pyra_sales_leads with ON DELETE CASCADE — when a lead is
--     deleted, attachment rows clear automatically. Orphan storage
--     objects (the bucket files) are v1.1 backlog (sweep cron).
--   - file_type CHECK constraint enforces the 2 allowed types at write
--     time. Extensible — adding a new type requires DB ALTER + CHECK
--     update.
--   - 2 indexes tuned for the per-lead grid view + uploader audit
--   - Storage paths follow: lead-attachments/{lead_id}/{ts}-{nanoid}.{ext}
--     in the existing pyraai-workspace bucket (public; obscure path is
--     the security model, matching existing workspace pattern for
--     invoices/contracts/WhatsApp media).
--
-- Not in v1 schema (deferred to v1.1):
--   - thumbnail_path — v1 uses the same image for grid + detail view
--     (1920×1920 max @ JPEG 0.82 = 150-300KB typical, OK without thumbnails)
--   - deleted_at soft-delete — CASCADE deletes are fine; audit trail in
--     pyra_activity_log + pyra_lead_activities (Phase 11.5 dual-write)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pyra_lead_attachments (
  id                varchar PRIMARY KEY,
  lead_id           varchar NOT NULL REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  file_type         varchar NOT NULL CHECK (file_type IN ('image', 'voice_note')),
  storage_path      text NOT NULL,
  mime_type         varchar NOT NULL,
  size_bytes        integer NOT NULL CHECK (size_bytes > 0),
  duration_seconds  integer,
  uploaded_by       varchar NOT NULL,
  uploaded_at       timestamptz NOT NULL DEFAULT NOW(),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Per-lead grid view: newest first
CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead_uploaded
  ON pyra_lead_attachments (lead_id, uploaded_at DESC);

-- Uploader audit: who uploaded what across the system
CREATE INDEX IF NOT EXISTS idx_lead_attachments_uploader
  ON pyra_lead_attachments (uploaded_by, uploaded_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- Column documentation
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE pyra_lead_attachments IS
  'Per-lead image/voice attachments (Phase 15.2). Camera + gallery uploads from mobile-first UI. ON DELETE CASCADE clears rows when lead is deleted; storage objects orphan-deletion is v1.1 backlog (sweep cron).';

COMMENT ON COLUMN pyra_lead_attachments.file_type IS
  'image (Phase 15.2 Commit 1) or voice_note (Phase 15.2 Commit 2). Extensible — add via DB ALTER + CHECK update.';

COMMENT ON COLUMN pyra_lead_attachments.storage_path IS
  'Relative path inside pyraai-workspace bucket. Format: lead-attachments/{lead_id}/{ts}-{nanoid}.{ext}. Public bucket — getPublicUrl() returns the canonical URL.';

COMMENT ON COLUMN pyra_lead_attachments.size_bytes IS
  'Final stored byte count AFTER client-side Canvas resize (1920×1920 max, JPEG 0.82). EXIF stripped as side effect of Canvas re-encode.';

COMMENT ON COLUMN pyra_lead_attachments.duration_seconds IS
  'Voice-note duration. NULL for images. Phase 15.2 Commit 2 populates this.';

COMMENT ON COLUMN pyra_lead_attachments.uploaded_by IS
  'pyra_users.username of the agent/admin who uploaded. NEVER from request body — server-derived from auth context. Used for the admin-OR-uploader delete gate.';

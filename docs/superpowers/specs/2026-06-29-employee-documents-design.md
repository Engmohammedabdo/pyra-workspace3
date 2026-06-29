# Employee Documents Vault — Design Spec

- **Date:** 2026-06-29
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Branch:** `feat/employee-documents`
- **Roadmap:** HR roadmap item #2 (after the HR Department Improvement bundle). Onboarding/Offboarding is the remaining roadmap item, specced separately later.

---

## 1. Context

The HR department has no place to store employee documents (employment
contracts, Emirates ID, passport, residence/visa, certificates) or to track
their expiry. For a UAE business this is a real compliance gap — visas and
Emirates IDs expire and lapses carry legal/financial penalties. A scoping pass
confirmed the workspace already has the infrastructure to build this cleanly:
a private storage bucket + signed-URL pattern (from lead attachments), a cron
pattern (follow-up reminders / lead-idle), and the HR Overview dashboard
(shipped in the prior bundle) whose alert banner this feature feeds.

## 2. Goals

A per-employee **private document vault**: HR uploads and manages any
employee's documents with an expiry date; the employee views/downloads their
own documents; expiring documents raise notifications (30-day + 7-day) and a
banner on the HR Overview dashboard. Document types are admin-configurable.

## 3. Scope

### In scope
1. **Configurable document types** — admin catalogue (`pyra_document_types`).
2. **HR document management** — upload/edit/delete any employee's docs
   (`documents.manage`), private storage + signed URLs.
3. **Employee self-service** — view/download own docs (`documents.view`).
4. **Expiry pipeline** — cron alerts (30-day to employee + HR, 7-day critical)
   + HR Overview alert integration.
5. **Surfaces** — `/dashboard/hr/documents` (HR), `/dashboard/my-documents`
   (employee), and a "وثائق" tab on `/dashboard/users/[username]` (HR in-context).

### Out of scope (→ v1.1 backlog)
- Employee self-upload (HR-only upload in v1).
- Per-download audit logging (log upload + delete only).
- Document versioning / replace-in-place (replace = delete + re-upload).
- OCR / auto-extraction of expiry dates.
- Portal/client surface (documents are internal employee PII).

## 4. Audience analysis (the 4-audience rule)

| Audience | Impact |
|---|---|
| **Admin / HR** | Full CRUD on all employees' documents + the types catalogue; sees expiry alerts on HR Overview; downloads via signed URLs. |
| **Employee** | Self-service: views + downloads **own** documents only (`documents.view` in `BASE_EMPLOYEE`); receives expiry notifications. No upload. |
| **Sales Agent** | Same as Employee (inherits `BASE_EMPLOYEE`) — own documents only. |
| **Client (portal)** | **None** — internal PII; no portal surface, no portal endpoint. |

## 5. Architecture decisions

**D1 — Reuse the `pyra-private` bucket + signed URLs.** Store at
`employee-documents/{username}/{doc_id}{ext}`; serve via 1h `createSignedUrl`.
Mirrors the lead-attachments implementation (private bucket, server-controlled
path, MIME allowlist, orphan cleanup). Rejected: a dedicated `pyra-hr-private`
bucket — same security model, extra ops, no gain.

**D2 — Configurable document types** (`pyra_document_types`), not a fixed enum.
Admin manages the catalogue so UAE-specific types (labour card, medical
certificate, …) can be added without a migration. Each type flags
`requires_expiry` so the upload form can require/skip an expiry date.

**D3 — Two-tier expiry alerts via a daily cron.** 30 days before expiry →
notify employee + HR; 7 days before → critical reminder. Per-doc dedup flags
(`expiry_alert_30_sent`, `expiry_alert_7_sent`) prevent re-fire; both reset
when `expiry_date` is edited. Mirrors `/api/cron/lead-idle-check`
(getExternalAuth + service-role + n8n schedule).

**D4 — HR-only upload, employee read-only.** Simplest safe model for PII;
employee self-upload is v1.1.

## 6. Database (migration 021) — 2 tables

**`pyra_document_types`** — configurable catalogue
- `id varchar PK` · `name varchar NOT NULL` · `name_ar varchar NOT NULL` ·
  `requires_expiry boolean NOT NULL DEFAULT false` ·
  `is_active boolean NOT NULL DEFAULT true` · `sort_order int NOT NULL DEFAULT 0`
  · `created_at timestamptz DEFAULT now()`
- Seed rows: عقد عمل / هوية إماراتية (requires_expiry) / جواز سفر
  (requires_expiry) / إقامة·تأشيرة (requires_expiry) / شهادة / أخرى.

**`pyra_employee_documents`**
- `id varchar PK` (`generateId('doc')`) · `employee_username varchar NOT NULL`
  (FK target by varchar, no cascade) · `type_id varchar NOT NULL` (→
  `pyra_document_types.id`) · `label text` · `storage_path text NOT NULL`
  (relative path in `pyra-private`) · `mime_type varchar NOT NULL` ·
  `size_bytes int NOT NULL CHECK (size_bytes > 0)` · `expiry_date date` (NULL =
  no expiry) · `expiry_alert_30_sent boolean NOT NULL DEFAULT false` ·
  `expiry_alert_7_sent boolean NOT NULL DEFAULT false` · `uploaded_by varchar
  NOT NULL` · `uploaded_at timestamptz NOT NULL DEFAULT now()` · `notes text` ·
  `metadata jsonb NOT NULL DEFAULT '{}'`
- **Indexes:** `(employee_username, uploaded_at DESC)`;
  partial `(expiry_date) WHERE expiry_date IS NOT NULL AND (expiry_alert_30_sent
  = false OR expiry_alert_7_sent = false)` (cron query);
  `(type_id)`.
- **Editing `expiry_date` resets both alert flags** (handled in the PATCH route).

## 7. Storage & security (LOCKED)

- Bucket `pyra-private` (private); path 100% server-controlled:
  `employee-documents/{username}/{Date.now()}-{nanoid}{ext}` — never from
  `file.name`.
- Extension from validated MIME via a `MIME_TO_EXT` map; **hard-error on a MIME
  miss** (don't leak user extension).
- Allowlist: `application/pdf` + common images (`image/jpeg`, `image/png`,
  `image/webp`); **SVG rejected** (XSS vector). Max **20 MB/file** (server
  enforced).
- Served only via short-lived signed URLs (`createSignedUrl`, 1h); viewer
  refetches on expiry. No public URLs.
- Upload route rate-limited (`uploadLimiter` / `checkRateLimit`).
- Orphan cleanup: if the DB insert fails after the storage upload, delete the
  uploaded object.
- Delete permission: `documents.manage` (HR). Cross-employee guard via
  double-eq (`.eq('id', id)` + ownership checks) where relevant.

## 8. RBAC

- `documents.view` — in `BASE_EMPLOYEE` (every internal user; own-scope only).
- `documents.manage` — admin/HR; gates HR document CRUD **and** the types
  catalogue. Admin holds `*`.
- Add both to `PERMISSIONS` + a `documents` `PERMISSION_MODULES` group in
  `lib/auth/rbac.ts`. Add `ENTITY_TYPES.DOCUMENT = 'document'` to
  `lib/api/activity.ts`. Add `'document_expiring_soon'` + `'document_expired'`
  to the `NotificationType` union in `lib/notifications/notify.ts`.

## 9. API surface

**Types catalogue** (`documents.manage`)
- `GET /api/hr/document-types` (list; active filter) · `POST` (create)
- `PATCH /api/hr/document-types/[id]` · `DELETE` (soft via `is_active`)

**HR documents** (`documents.manage`, service-role after gate)
- `GET /api/hr/documents` (list; filter by `employee_username`, `type_id`,
  expiry window; inline signed URLs)
- `POST /api/hr/documents` (multipart upload; MIME/size guards; logActivity)
- `PATCH /api/hr/documents/[id]` (label/expiry/notes; resets alert flags if
  expiry changes) · `DELETE` (storage + row; orphan-safe)
- `GET /api/hr/documents/[id]/signed-url` (fresh signed URL)

**Employee self-service** (`documents.view`, own-scope)
- `GET /api/my-documents` (own docs; inline signed URLs)
- `GET /api/my-documents/[id]/signed-url` (own doc only; ownership check)

**Cron** (`getExternalAuth` + `cron.document-expiry-check`)
- `POST /api/cron/document-expiry-check`

## 10. Hooks

- `hooks/useDocumentTypes.ts` — `useDocumentTypes`, `useCreateDocumentType`,
  `useUpdateDocumentType`, `useDeleteDocumentType`.
- `hooks/useEmployeeDocuments.ts` (HR) — `useEmployeeDocuments(params?)`,
  `useEmployeeDocumentsByUser(username)`, `useUploadEmployeeDocument`
  (raw `fetch` FormData — the documented multipart exemption),
  `useUpdateEmployeeDocument`, `useDeleteEmployeeDocument`.
- `hooks/useMyDocuments.ts` — `useMyDocuments`.

## 11. UI surfaces

- **`/dashboard/hr/documents`** (`documents.manage`) — `DataTable`: employee,
  type, label, expiry (colored badge: ok/expiring/expired), uploaded-by,
  actions (download/edit/delete). Filters: employee, type, expiry-status.
  Upload dialog (employee select, type select, label, expiry-date picker —
  required iff `requires_expiry`, file dropzone, notes). A document-types
  management section/sub-page (configurable catalogue).
- **`/dashboard/my-documents`** (`documents.view`) — employee read-only list +
  download + expiry badge + inline "expiring soon" notice; `EmptyState`.
- **"وثائق" tab** on `/dashboard/users/[username]` — HR in-context view of that
  employee's documents (reuses the HR list components, scoped to one user).
- Sidebar: `/dashboard/hr/documents` ("وثائق الموظفين", `documents.manage`) +
  `/dashboard/my-documents` ("وثائقي", `documents.view`) in the HR group.
  Module-guide entries for both.

## 12. Expiry pipeline

- **Cron** `/api/cron/document-expiry-check` (daily 08:00 Dubai via n8n,
  mirrors `lead-idle-check`): for docs with `expiry_date` within 30 days and
  `expiry_alert_30_sent=false` → `notify()` employee + HR
  (`document_expiring_soon`), set flag; within 7 days and
  `expiry_alert_7_sent=false` → critical `notify()`, set flag. Already-expired
  docs are reported to HR Overview (not re-notified each day).
- **HR Overview integration**: extend `AlertInput` + `deriveAlerts` in
  `lib/hr/overview-helpers.ts` with `docsExpiringSoon` (high) and `docsExpired`
  (critical) branches linking to `/dashboard/hr/documents`; query the counts in
  `app/api/hr/overview/route.ts`.
- Idempotency: flags flip regardless of notify outcome (per the cron lock);
  flags reset on `expiry_date` edit.

## 13. Phasing (each phase: `pnpm run check` + `pnpm build` → commit → push)

1. **Plumbing** — migration 021 (2 tables + seed + indexes); permissions;
   `ENTITY_TYPES.DOCUMENT`; `NotificationType` additions; `types/database.ts`
   interfaces; sidebar + module-guide.
2. **Types catalogue** — API + `useDocumentTypes` + settings UI.
3. **HR documents API** — CRUD + signed-url + private storage (MIME/size guards,
   orphan cleanup, logActivity/logError, rate-limit).
4. **Employee self-service API** — `/api/my-documents` (+ signed-url) + hooks.
5. **UI** — HR list + upload dialog + filters; employee page; user-detail tab.
6. **Expiry pipeline** — cron + `notify()` types + HR Overview alert.
7. **Verify + docs** — check/build/test; module-guide tips; CLAUDE.md
   locked-decisions + DATABASE-SCHEMA + EMPLOYEE-SYSTEM updates.

## 14. Testing & verification

- Each phase: `pnpm run check` + `pnpm build`.
- Pure logic unit-tested (Vitest): expiry-tier classification (ok / expiring-30
  / expiring-7 / expired), alert-flag reset on expiry edit, the
  `deriveAlerts` document branches.
- Migration 021 applied + verified via `pg/query`, then `pnpm db:record 021`.
- Per-audience smoke: HR uploads a doc with expiry 25 days out → cron →
  employee + HR notified → signed URL downloads the right file → HR Overview
  shows the alert. Employee sees only own docs; cannot hit HR endpoints (403).
- Security: confirm objects are NOT publicly reachable (only via signed URL);
  SVG + >20 MB rejected; storage path never derived from `file.name`.

## 15. Risks / decisions (resolved in brainstorming)

- Types: **configurable** (Q chosen). Alerts: **30-day both + 7-day critical**.
  Placement: **standalone pages + user-detail tab**. Upload: **HR-only**.
- Bucket: **reuse `pyra-private`**. File types: **PDF + images, no SVG**, 20 MB.
  Download logging: **off** (v1.1). Per-employee cap: **none** (per-file 20 MB).

## 16. v1.1 backlog

Employee self-upload (with HR review); per-download audit logging; document
versioning/replace-in-place; OCR auto-expiry; tiered 60/30/7 alerts; bulk
upload; export/zip an employee's documents.

# Employee Onboarding — Design Spec (Phase 1 of HR Lifecycle)

**Date:** 2026-06-30
**Status:** Approved decisions captured; pending final spec review.
**Author:** brainstorming session with Abdou.

## 1. Context & Decomposition

Pyramedia has a mature paper HR process (offer letter, NDA, asset handover,
salary receipt). We are building an in-system **Employee Lifecycle** module in
3 independent sub-projects, each its own spec → plan → build cycle:

1. **Onboarding** ← *this spec* (highest daily value, reuses the most existing
   infrastructure).
2. **Asset Register** (promotes onboarding's inline asset JSON to a tracked
   register; feeds offboarding returns).
3. **Offboarding / End-of-Service** (exit checklist + access revocation + final
   settlement + certificates).

This spec covers **Onboarding only**.

## 2. Goal

A new-hire flow that: creates the employee record, **generates the offer letter,
NDA, and asset-handover form** from the entered data (high-quality Arabic),
stores them in the existing Employee Documents Vault, and tracks a simple
onboarding checklist to completion.

## 3. Locked Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Start | Onboarding first |
| Document generation | Generate all 3 onboarding docs (offer letter, NDA, asset handover) |
| Entry point | A **wizard creates** the `pyra_users` record |
| Checklist | Simple **unified** checklist (no per-task assignees; HR tracks all) |
| Probation tracking | **Out of scope** → v1.1 |
| PDF approach | **jsPDF + `arabic-reshaper` + bidi** (improved Arabic on the existing stack; NO headless browser / Chromium) |
| Salary receipt | **Out of scope** here — belongs to the payroll surface (generate from a paid payslip), not onboarding |

## 4. Architecture & Placement

- **Page:** `/dashboard/hr/onboarding` — list of onboarding records + "موظف جديد"
  button that opens the wizard. Plus a per-record detail view (checklist +
  generated documents + regenerate actions).
- **Permission:** all onboarding routes gate on `hr.manage` (admin/HR only) —
  the first real write-use of the reserved `hr.manage` permission. The wizard's
  user-creation runs server-side via service role AFTER the `hr.manage` gate
  (onboarding is inherently an HR admin action; documented deviation from
  routing user creation through `users.manage`).
- **Gate-then-service-role** on every route (payroll/Gap-#3 pattern).

## 5. Data Model

### 5.1 New table: `pyra_onboarding` (one row per new hire)
| Column | Type | Notes |
|---|---|---|
| id | varchar PK | `generateId('onb')` |
| employee_username | varchar NOT NULL | the created `pyra_users.username` |
| status | varchar NOT NULL | `in_progress` \| `completed` \| `cancelled` (default `in_progress`) |
| offer_data | jsonb NOT NULL | snapshot of all offer-letter inputs (comp breakdown, is_sales, commission, target, contract, position, party fields) — lets us regenerate the offer letter |
| assets | jsonb NOT NULL default `'[]'` | array of `{type, description, serial, condition, value, notes}` for the handover form (Phase 1 inline; Phase 2 promotes to a register) |
| started_by | varchar NOT NULL | admin username |
| started_at | timestamptz default now() |
| completed_at | timestamptz NULL |
| notes | text NULL |

### 5.2 New table: `pyra_onboarding_tasks` (checklist items)
| Column | Type | Notes |
|---|---|---|
| id | varchar PK | `generateId('obt')` |
| onboarding_id | varchar NOT NULL | FK → `pyra_onboarding(id)` ON DELETE CASCADE |
| title_ar | text NOT NULL | |
| is_done | boolean NOT NULL default false | |
| done_at | timestamptz NULL | |
| done_by | varchar NULL | |
| sort_order | int NOT NULL default 0 | |
| notes | text NULL | |

### 5.3 Document Vault additions
Three new rows in `pyra_document_types` (seeded by the migration):
`dt_offer_letter` (عرض عمل), `dt_nda` (اتفاقية سرية), `dt_asset_handover`
(نموذج تسليم عهدة). `requires_expiry=false` for all three. Generated PDFs are
stored as `pyra_employee_documents` rows (existing vault: private bucket
`pyra-private`, signed URLs, `storage_path` never returned to client).

### 5.4 Migration
One migration (`024_pyra_onboarding.sql`): both tables + indexes
(`onboarding_id`, `employee_username`) + the 3 document-type seed rows
(`INSERT ... ON CONFLICT (id) DO NOTHING`). Forward-only. Applied + recorded by
the controller per Phase 14.2.

## 6. The Wizard (new hire)

A multi-step form (single page, stepped sections). Fields mirror the existing
offer-letter generator:

1. **Personal:** full name (EN), full name (AR), nationality, passport no.,
   Emirates ID, date of birth, phone, email, username (auto-suggested), password
   (admin sets; shared out-of-band — convert-to-customer pattern, no auto email).
2. **Position:** job title (EN/AR), department (EN/AR), reports-to, start date,
   contract type (default Fixed-Term), duration (default 1 year),
   **is_sales toggle**.
3. **Compensation (AED):** basic, housing, transport, communication, other;
   monthly + annual totals computed live. If `is_sales`: commission rate (%) +
   monthly target.
4. **Assets:** repeatable rows — type (laptop/phone/SIM/access card/camera/other),
   description/model, serial/IMEI, condition, estimated value, notes.
5. **Review → Create.** On submit (single server transaction-ish, backup-rollback
   pattern — no DB transactions):
   1. Create `pyra_users` (status `active`, `hire_date` = start date, salary +
      payment_type from comp, `date_of_birth`, etc.). Reuse the SAME creation
      logic as `/api/users` POST — password hashing + `pyra_auth_mapping` insert
      — invoked **inline server-side** (NOT via an HTTP call to that route, which
      gates on `users.manage`). The onboarding route's own `hr.manage` gate is the
      authorization boundary. Factor the shared creation steps into a helper if
      that avoids duplicating the `/api/users` logic.
   2. Insert `pyra_onboarding` (status `in_progress`, `offer_data`, `assets`).
   3. Generate the 3 PDFs server-side → upload to `pyra-private` → insert 3
      `pyra_employee_documents` rows (types above).
   4. Seed `pyra_onboarding_tasks` from the default template (§8).
   5. `logActivity` + `notify` (admin/HR + the new employee).
   - On any failure after user creation: best-effort cleanup (remove uploaded
     storage objects, delete created rows) and return a clear error.

## 7. Document Generation (improved Arabic)

### 7.1 Shared Arabic helper: `lib/pdf/arabic.ts`
The current generators rely on jsPDF's `doc.processArabic()`, which is weak for
dense flowing Arabic. Replace with a proper pipeline:

- Deps: `arabic-reshaper` (contextual letter shaping) + a bidi reorderer
  (`bidi-js`). Both pure-JS → run in Node (server-side generation) and browser.
- `prepareRtl(text): string` — reshape → bidi reorder → returns a
  visually-ordered string safe to hand to jsPDF `doc.text(..., {align:'right'})`.
- `drawRtlParagraph(doc, text, opts): number` — wraps a long Arabic paragraph to
  `maxWidth`: `splitTextToSize` on the SHAPED text, `prepareRtl` per line, draw
  right-aligned at `opts.x`/`opts.y` with `opts.lineHeight`; auto page-break when
  `y` exceeds the bottom margin; returns the new `y`.
- `drawBilingualClause(doc, en, ar, opts)` — convenience for the EN-line +
  AR-line clause pattern used throughout the offer letter.

> jsPDF stays the engine (no new heavy infra). The reshaper+bidi only fix the
> Arabic correctness. This helper MAY later be retrofitted into invoice/quote/
> payslip generators (v1.1) — out of scope here.

### 7.2 Generators (server-side; reuse `pdf-assets-server.ts` font/logo injection)
- `lib/pdf/offer-letter-pdf.ts` — full bilingual offer letter ported from the
  user's HTML generator: header + ref/date, employee block, Position, Contract
  type & duration, Probation clause, Compensation **table** (basic/housing/
  transport/comm/other + monthly/annual totals), **Sales Commission section
  (rendered only when `is_sales`)** with the exact clauses (rate, payment
  condition, exclusions, target, probation compensation, confirmation condition,
  3-month note), Working Hours & Days, Annual Leave, Other Benefits, Termination
  & Notice, Confidentiality (NDA ref), Media & Image Rights, Work Location +
  optional extra note, General Terms, Acceptance + signature blocks, footer.
- `lib/pdf/nda-pdf.ts` — the 3-page NDA: static legal Arabic body (15 articles,
  verbatim from the user's PDF) + filled party/employee fields (name, EID/passport,
  nationality, job title, dates) + signature block. Uses `drawRtlParagraph` with
  page-break handling.
- `lib/pdf/asset-handover-pdf.ts` — the asset custody form: employee block + the
  **asset table** (rows from `assets`) + the obligations/liability legal text +
  the return/acknowledgement + signatures (+ the short English appendix).

All three are isomorphic utilities (NOT `'use client'`), generated server-side
during the wizard submit and stored to the vault. Logo via `loadServerDefaultLogo`
(or the business-entity logo if one is selected — v1.1).

### 7.3 Regeneration
The onboarding detail page has a "إعادة توليد" action per document (re-runs the
generator from `offer_data`/`assets`, replaces the stored unsigned PDF). The
signed-copy upload is a separate vault upload (checklist item).

## 8. Checklist (simple, unified)

Default template seeded on creation (Arabic titles, HR tracks all — no assignees):
1. تجهيز البريد الإلكتروني
2. تسليم اللابتوب والعهدة
3. توقيع عرض العمل ورفع النسخة الموقّعة
4. توقيع اتفاقية السرية (NDA) ورفع النسخة الموقّعة
5. توقيع نموذج تسليم العهدة ورفع النسخة الموقّعة
6. إضافة الموظف للفرق والبوردات
7. شرح الأنظمة والصلاحيات
8. تفعيل المصادقة الثنائية (2FA)

Each task: toggle done/undone (+ `done_at`/`done_by`), optional note. A progress
bar shows X/N. Marking all done (or an explicit "إنهاء التعيين" button) sets
`pyra_onboarding.status='completed'` + `completed_at` + activity log.

## 9. API Endpoints

- `GET /api/hr/onboarding` — list (hr.manage) → onboarding rows + employee
  display name + task progress summary.
- `POST /api/hr/onboarding` — create new hire (the §6.5 flow). hr.manage.
- `GET /api/hr/onboarding/[id]` — detail (record + tasks + linked documents with
  signed URLs). hr.manage.
- `PATCH /api/hr/onboarding/[id]` — update status (`complete`/`cancel`) + notes.
  hr.manage.
- `PATCH /api/hr/onboarding/[id]/tasks/[taskId]` — toggle a task (cross-resource
  guard: `WHERE id=taskId AND onboarding_id=id`). hr.manage.
- `POST /api/hr/onboarding/[id]/documents/[docType]/regenerate` — regenerate one
  document from stored data. hr.manage.

All use `apiSuccess`/`apiError`, `logError` in catches, `logActivity` on writes
(`action_type = ${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.Y}` + `metadata.source`).

## 10. Hooks & UI

- `hooks/useOnboarding.ts` — `useOnboardingList`, `useOnboarding(id)`,
  `useCreateOnboarding`, `useUpdateOnboarding`, `useToggleOnboardingTask`,
  `useRegenerateDocument`. React Query (`fetchAPI`/`mutateAPI`).
- UI: `app/dashboard/hr/onboarding/{page.tsx,onboarding-client.tsx}` (list +
  wizard trigger), `app/dashboard/hr/onboarding/[id]/{page.tsx,...}` (detail).
  Wizard + sub-sections split into `components/hr/onboarding/*`
  (`NewHireWizard`, step panels, `OnboardingChecklist`, `OnboardingDocuments`)
  — each file <300 lines.
- Sidebar entry (HR group, `hr.manage`), module-guide entry, guide-page section.

## 11. Integration Points

- **Employee Documents Vault** — generated + signed docs land here (3 new types).
- **`pyra_users`** — the wizard creates the employee; payroll's active-only +
  hire-date pro-ration already handle a new hire correctly.
- **Notifications / Activity log** — central helpers.
- **Deactivation procedure** — NOT touched here (that's Phase 3 Offboarding).

## 12. Out of Scope (v1.1 / later phases)

- Asset Register as a tracked system → Phase 2.
- Offboarding / end-of-service / clearance / final settlement / certificates →
  Phase 3.
- Probation tracking + confirmation form → v1.1.
- Salary-receipt PDF generation → payroll surface (separate small task).
- Per-task assignees + employee self-service onboarding view → v1.1.
- Automated welcome email (no mailer template infra) — credentials shared
  out-of-band, matching the convert-to-customer lock.
- Retrofitting the reshaper+bidi helper into invoice/quote/payslip → v1.1.
- Business-entity-specific logo on generated docs → v1.1 (default logo for now).

## 13. Testing

- Pure unit tests for `lib/pdf/arabic.ts` (`prepareRtl` shaping/order on known
  inputs) and for any pure compensation/total computation extracted from the
  wizard.
- The PDF generators + routes verified via `pnpm run check` + `pnpm build` +
  manual live smoke (generate each doc for a test hire, open the PDF, verify
  Arabic renders correctly) — **live smoke is mandatory this time** (the
  documents-page crash slipped past build/tsc because it was a runtime render
  error).

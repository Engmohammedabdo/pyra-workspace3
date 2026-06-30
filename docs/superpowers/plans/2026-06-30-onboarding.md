# Employee Onboarding (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A new-hire wizard that creates the employee, generates the offer
letter + NDA + asset-handover form (high-quality Arabic), stores them in the
Employee Documents Vault, and tracks a simple onboarding checklist.

**Architecture:** New `/dashboard/hr/onboarding` surface (hr.manage). Two new
tables (`pyra_onboarding`, `pyra_onboarding_tasks`). Server-side PDF generation
on the existing jsPDF stack, upgraded with `arabic-reshaper` + `bidi-js` for
correct Arabic paragraphs. Generated PDFs stored in the existing `pyra-private`
vault as `pyra_employee_documents`. User creation reuses the `/api/users` POST
logic via a shared helper.

**Tech Stack:** Next.js 15, Supabase (service-role), jsPDF + Amiri + NEW
`arabic-reshaper` + `bidi-js`, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-30-onboarding-design.md`.
**Verbatim doc content:** `docs/onboarding-templates/` (offer HTML, `nda-content-ar.md`, `asset-handover-content-ar.md`).

## Global Constraints

- **Locked decisions:** Onboarding first; generate all 3 docs; **wizard creates**
  the `pyra_users` record; **simple unified checklist** (no per-task assignees);
  **no probation tracking** (v1.1); **PDF = jsPDF + arabic-reshaper + bidi**
  (NO headless browser); salary receipt OUT of scope.
- **Offer letter content differs by role:** `is_sales=true` → include the Sales
  Commission Structure section (clauses a–f + note); `is_sales=false` → omit it.
  Section numbering is **dynamic** (number only visible sections — no gaps).
- **Custom clauses:** `offer_data.custom_clauses: Array<{title?: string, body: string}>`
  rendered as an "بنود إضافية / Additional Terms" section iff non-empty.
- **Gate-then-service-role** on every route; onboarding routes gate on `hr.manage`.
- **Status strings** from `lib/constants/statuses.ts`; new onboarding statuses are
  local string unions (no DB CHECK churn): `in_progress|completed|cancelled`.
- **`fetchAPI`/`mutateAPI` already unwrap `{data}`**; no raw `fetch()` in components.
- **`logError`** in route catches; **`logActivity`** on writes
  (`action_type = ${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.Y}` + `metadata.source`).
- **Private storage invariant:** generated PDFs go to bucket `pyra-private`;
  `storage_path` NEVER returned to client — list/detail return `signed_url` only.
- **RTL** (logical classes) + **dark-mode pairs** in all UI. Arabic UI, English code.
- **Page/file size** < 300 lines — split into `components/hr/onboarding/*`.
- **Live smoke is MANDATORY** before merge: generate each of the 3 PDFs for a test
  hire and visually confirm Arabic renders correctly (the docs-page crash + the
  jsPDF-Arabic concern both demand eyes-on verification, not just build/tsc).
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/024_pyra_onboarding.sql` | tables + indexes + 3 doc-type seeds |
| `lib/pdf/arabic.ts` | reshaper+bidi RTL helpers for jsPDF |
| `__tests__/pdf-arabic.test.ts` | unit tests for the helper |
| `lib/pdf/offer-letter-pdf.ts` | offer letter generator (isomorphic) |
| `lib/pdf/nda-pdf.ts` | NDA generator (isomorphic) |
| `lib/pdf/asset-handover-pdf.ts` | asset handover generator (isomorphic) |
| `lib/hr/create-employee.ts` | shared user-creation logic (factored from /api/users) |
| `lib/hr/store-generated-document.ts` | upload a generated PDF Buffer to the vault |
| `lib/constants/onboarding.ts` | default checklist template + status consts + asset/clause types |
| `app/api/hr/onboarding/route.ts` | GET list + POST create |
| `app/api/hr/onboarding/[id]/route.ts` | GET detail + PATCH status |
| `app/api/hr/onboarding/[id]/tasks/[taskId]/route.ts` | PATCH toggle task |
| `app/api/hr/onboarding/[id]/documents/[docType]/regenerate/route.ts` | regenerate one doc |
| `hooks/useOnboarding.ts` | React Query hooks |
| `app/dashboard/hr/onboarding/{page.tsx,onboarding-client.tsx}` | list + wizard trigger |
| `app/dashboard/hr/onboarding/[id]/{page.tsx,onboarding-detail-client.tsx}` | detail |
| `components/hr/onboarding/*` | NewHireWizard + step panels + checklist + documents |
| `types/database.ts` | `PyraOnboarding`, `PyraOnboardingTask` |
| sidebar / module-guide / guide page | nav + docs |

---

### Task 1: Migration 024 — onboarding tables + document types

**Files:** Create `supabase/migrations/024_pyra_onboarding.sql`.

**Interfaces:** Produces tables `pyra_onboarding`, `pyra_onboarding_tasks`; doc
types `dt_offer_letter`, `dt_nda`, `dt_asset_handover`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 024: Employee Onboarding (Phase 1)
CREATE TABLE IF NOT EXISTS pyra_onboarding (
  id varchar(24) PRIMARY KEY,
  employee_username varchar NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'in_progress',
  offer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by varchar NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_onboarding_employee ON pyra_onboarding(employee_username);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON pyra_onboarding(status);

CREATE TABLE IF NOT EXISTS pyra_onboarding_tasks (
  id varchar(24) PRIMARY KEY,
  onboarding_id varchar(24) NOT NULL REFERENCES pyra_onboarding(id) ON DELETE CASCADE,
  title_ar text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by varchar,
  sort_order int NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_onb ON pyra_onboarding_tasks(onboarding_id);

INSERT INTO pyra_document_types (id, name, name_ar, requires_expiry, is_active, sort_order)
VALUES
  ('dt_offer_letter', 'Offer Letter', 'عرض عمل', false, true, 10),
  ('dt_nda', 'NDA', 'اتفاقية سرية', false, true, 11),
  ('dt_asset_handover', 'Asset Handover', 'نموذج تسليم عهدة', false, true, 12)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Controller applies + verifies + records** (NOT a subagent step):
  apply via `pg/query`, verify both tables + 3 doc-type rows exist, then
  `pnpm db:record 024_pyra_onboarding --by=elharm`.

- [ ] **Step 3: Commit** the migration file.

---

### Task 2: Arabic PDF helper (`lib/pdf/arabic.ts`) + tests

**Files:** Create `lib/pdf/arabic.ts`, `__tests__/pdf-arabic.test.ts`. Add deps.

**Interfaces:** Produces `prepareRtl(text: string): string`,
`drawRtlParagraph(doc, text, opts): number`, `drawBilingualClause(doc, en, ar, opts): number`.
Consumed by Tasks 3–5.

- [ ] **Step 1: Add deps**

Run: `pnpm add arabic-reshaper bidi-js`
(Both pure-JS, work in Node + browser.)

- [ ] **Step 2: Write the failing test** (`__tests__/pdf-arabic.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { prepareRtl } from '@/lib/pdf/arabic';

describe('prepareRtl', () => {
  it('returns a non-empty string for Arabic input', () => {
    const out = prepareRtl('السلام عليكم');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
  it('reorders so the visual order differs from logical for RTL', () => {
    // After bidi reordering for LTR-rendering engines, the string is reversed-ish.
    expect(prepareRtl('عربي')).not.toBe('عربي');
  });
  it('passes plain ASCII through unchanged', () => {
    expect(prepareRtl('AED 5000')).toContain('5000');
  });
});
```

- [ ] **Step 3: Run test → FAIL** (`pnpm test pdf-arabic`) — module not found.

- [ ] **Step 4: Implement `lib/pdf/arabic.ts`**

```ts
// Improved Arabic rendering for jsPDF: contextual shaping (arabic-reshaper)
// + visual reordering (bidi-js), then hand the result to jsPDF text() which
// draws left-to-right. Fixes broken/disconnected Arabic in dense paragraphs
// that jsPDF's built-in processArabic handles poorly.
import reshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';
import type jsPDF from 'jspdf';

const bidi = bidiFactory();

/** Shape + bidi-reorder a single line for jsPDF (which renders LTR). */
export function prepareRtl(text: string): string {
  if (!text) return '';
  const shaped = reshaper.convertArabic(text);
  const embedding = bidi.getEmbeddingLevels(shaped, 'rtl');
  const flips = bidi.getReorderSegments(shaped, embedding);
  // Apply the reorder segments (reverse each) to produce visual order.
  const chars = shaped.split('');
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = start; i <= end; i++) chars[i] = slice[i - start];
  }
  return chars.join('');
}

interface ParaOpts {
  x: number;          // right edge for RTL (align right)
  y: number;
  maxWidth: number;
  lineHeight: number;
  fontSize?: number;
  bottomMargin?: number;  // page-break threshold (default 280)
  pageTopY?: number;      // y to reset to after a page break (default 20)
}

/**
 * Draw a wrapped RTL Arabic paragraph, right-aligned at opts.x.
 * Wraps on the SHAPED text width, prepares each line, auto page-breaks.
 * Returns the new y after the paragraph.
 */
export function drawRtlParagraph(doc: jsPDF, text: string, opts: ParaOpts): number {
  const { x, maxWidth, lineHeight } = opts;
  let y = opts.y;
  const bottom = opts.bottomMargin ?? 280;
  const top = opts.pageTopY ?? 20;
  if (opts.fontSize) doc.setFontSize(opts.fontSize);
  const shaped = reshaper.convertArabic(text || '');
  const lines: string[] = doc.splitTextToSize(shaped, maxWidth);
  for (const line of lines) {
    if (y > bottom) { doc.addPage(); y = top; }
    doc.text(prepareRtlShaped(line), x, y, { align: 'right' });
    y += lineHeight;
  }
  return y;
}

/** prepareRtl when text is ALREADY shaped (used internally after splitTextToSize). */
function prepareRtlShaped(shaped: string): string {
  const embedding = bidi.getEmbeddingLevels(shaped, 'rtl');
  const flips = bidi.getReorderSegments(shaped, embedding);
  const chars = shaped.split('');
  for (const [start, end] of flips) {
    const slice = chars.slice(start, end + 1).reverse();
    for (let i = start; i <= end; i++) chars[i] = slice[i - start];
  }
  return chars.join('');
}

/** EN line (left) + AR line (right) clause block. Returns new y. */
export function drawBilingualClause(
  doc: jsPDF, en: string, ar: string,
  opts: { xLeft: number; xRight: number; y: number; maxWidth: number; lineHeight: number },
): number {
  let y = opts.y;
  doc.setFont('helvetica', 'normal');
  const enLines: string[] = doc.splitTextToSize(en, opts.maxWidth);
  for (const l of enLines) { doc.text(l, opts.xLeft, y); y += opts.lineHeight; }
  doc.setFont('Amiri', 'normal');
  y = drawRtlParagraph(doc, ar, { x: opts.xRight, y, maxWidth: opts.maxWidth, lineHeight: opts.lineHeight });
  return y;
}
```
> NOTE for implementer: verify the exact `bidi-js` API (`getEmbeddingLevels`,
> `getReorderSegments`) against the installed version's README; adapt the
> reorder application if the signature differs. The CONTRACT
> (`prepareRtl`/`drawRtlParagraph`/`drawBilingualClause`) must stay stable.

- [ ] **Step 5: Run test → PASS.** Then commit.

---

### Task 3: Offer letter generator (`lib/pdf/offer-letter-pdf.ts`)

**Files:** Create `lib/pdf/offer-letter-pdf.ts`.
**Source content:** `docs/onboarding-templates/source/offer-letter-generator.html`
(READ IT — all clauses, the comp table, the is_sales toggle, the extra-note
field are there verbatim, bilingual).
**Interfaces:** Consumes `lib/pdf/arabic.ts` + `pdf-fonts.ts` (`registerArabicFont`).
Produces `generateOfferLetterPDF(data: OfferLetterData, opts?: { fonts?; defaultLogo? }): Promise<Blob>` (isomorphic — NOT `'use client'`).

`OfferLetterData` (derived from `offer_data`):
```ts
export interface OfferLetterData {
  refNo: string; year: string; date: string; startDate: string;
  nameEn: string; nationality: string; passport: string; idNumber: string;
  titleEn: string; titleAr: string; deptEn: string; deptAr: string; reportsTo: string;
  isSales: boolean;
  basic: number; housing: number; transport: number; communication: number; other: number;
  commissionRate?: number; monthlyTarget?: number;
  customClauses: Array<{ title?: string; body: string }>;
  signatoryName: string; signatoryTitle: string;
  companyName: string; // from pyra_settings
}
```

- [ ] **Step 1:** Mirror `lib/pdf/payslip-pdf.ts` structure (jsPDF a4, header bar,
  `await registerArabicFont(doc, opts?.fonts)`). Build the document section-by-section
  from the HTML source, using `drawBilingualClause`/`drawRtlParagraph` for Arabic.
  Compute the **visible section list** first (commission only if `isSales`;
  custom-clauses section only if `customClauses.length`), then number sequentially.
  Render the **compensation table** (basic/housing/transport/comm/other + monthly +
  annual = ×12 + TOTAL) like the payslip earnings table.
- [ ] **Step 2:** Sales block (only when `isSales`): clauses a–f + the
  3-consecutive-months note — verbatim from the HTML `commission-block`.
- [ ] **Step 3:** Custom clauses section (only when non-empty): heading "بنود إضافية
  / Additional Terms", then one numbered clause per entry (optional title bolded,
  body via `drawRtlParagraph`).
- [ ] **Step 4:** Acceptance + dual signature blocks + footer (verbatim).
- [ ] **Step 5:** Return `doc.output('blob')`. Verify `pnpm run check`. Commit.
  (No unit test — verified by live smoke in Task 11.)

---

### Task 4: NDA generator (`lib/pdf/nda-pdf.ts`)

**Files:** Create `lib/pdf/nda-pdf.ts`.
**Source content:** `docs/onboarding-templates/nda-content-ar.md` (verbatim 15 articles).
**Interfaces:** `generateNdaPDF(data: NdaData, opts?): Promise<Blob>`.
```ts
export interface NdaData {
  date: string; nameAr: string; idNumber: string; nationality: string; jobTitle: string; address?: string;
  companyName: string; // 'PyramediaX for Marketing & AI Solution'
}
```

- [ ] **Step 1:** Header (title bilingual) + the 3-row meta table + parties block
  (fill party-two fields from `data`). Use `drawRtlParagraph` for all body text.
- [ ] **Step 2:** Render articles 1–15 verbatim from `nda-content-ar.md`, each with
  its heading + body, auto page-breaking (the helper handles `addPage`). Footer on
  each page: `… — Confidential / وثيقة سرية — صفحة N من 3` (use a footer pass over
  `doc.getNumberOfPages()`).
- [ ] **Step 3:** إقرار الموظف + the two-party signature block. Return blob.
- [ ] **Step 4:** `pnpm run check`. Commit. (Live-smoke verified in Task 11 — the
  Arabic-rendering acceptance test.)

---

### Task 5: Asset-handover generator (`lib/pdf/asset-handover-pdf.ts`)

**Files:** Create `lib/pdf/asset-handover-pdf.ts`.
**Source content:** `docs/onboarding-templates/asset-handover-content-ar.md`.
**Interfaces:** `generateAssetHandoverPDF(data: AssetHandoverData, opts?): Promise<Blob>`.
```ts
export interface AssetHandoverData {
  employeeName: string; jobTitle: string; department: string; idNumber: string;
  username: string; handoverDate: string; handoverPlace?: string;
  assets: Array<{ type: string; description: string; serial: string; condition: string; value: string; notes: string }>;
  companyName: string; // 'pyramediaX for marketing managment'
}
```

- [ ] **Step 1:** Header + "أولاً: بيانات الموظف" block (filled) + "ثانياً" assets
  TABLE (one row per asset; columns per the content file).
- [ ] **Step 2:** Sections ثالثاً–تاسعاً verbatim from the content file (acknowledgement,
  obligations 1–7, liability, confidentiality, UAE legal refs, return section blanks,
  signature table) via `drawRtlParagraph`, + the English appendix.
- [ ] **Step 3:** Return blob. `pnpm run check`. Commit.

---

### Task 6: Shared employee-creation + document-store helpers

**Files:** Create `lib/hr/create-employee.ts`, `lib/hr/store-generated-document.ts`.
Modify `app/api/users/route.ts` to use `createEmployeeUser` (DRY; no behaviour change).
**Interfaces (Produces):**
- `createEmployeeUser(serviceClient, input): Promise<{ ok: true; user } | { ok: false; error: string }>`
  — replicates the /api/users POST steps: existence check → `auth.admin.createUser`
  → `pyra_users` insert (`hashPassword`) → `pyra_auth_mapping` → employee leave
  balances → rollback on each failure. `input` = the same fields /api/users accepts.
- `storeGeneratedDocument(serviceClient, opts): Promise<{ storage_path: string; doc_id: string }>`
  where `opts = { employeeUsername, typeId, label, pdf: Buffer, uploadedBy }`. Uploads
  to bucket `pyra-private` at `employee-documents/{username}/{Date.now()}-${generateId('doc').slice(4)}.pdf`
  (mime `application/pdf`), inserts a `pyra_employee_documents` row, returns ids.
  Orphan-cleanup: if the DB insert fails, remove the uploaded object.

- [ ] **Step 1:** Extract the exact user-creation steps from
  `app/api/users/route.ts` (read it) into `createEmployeeUser`. Refactor the route
  to call it. Verify the route still behaves identically (`pnpm run check`).
- [ ] **Step 2:** Write `storeGeneratedDocument` mirroring the Employee-Documents
  upload route's storage + insert (read `app/api/hr/documents/route.ts` for the
  exact `pyra_employee_documents` columns + `DOC_BUCKET`/MIME constants).
- [ ] **Step 3:** Commit.

---

### Task 7: Onboarding create + list route (`app/api/hr/onboarding/route.ts`)

**Files:** Create `app/api/hr/onboarding/route.ts`.
**Interfaces:** Consumes Tasks 2–6 + `lib/constants/onboarding.ts` (Task 9).

- **GET** (`hr.manage`, service role): list `pyra_onboarding` + employee
  display_name + task progress `{done, total}`. `logError` on catch.
- **POST** (`hr.manage`, service role): body = wizard payload (personal, position,
  comp, `is_sales`, commission/target, `custom_clauses`, `assets`, password).
  Flow:
  1. `createEmployeeUser(...)` (status `active`, role from is_sales →
     `sales_agent` else `employee`, hire_date, salary, payment_type, dob, dept, etc.).
  2. Insert `pyra_onboarding` (`generateId('onb')`, status `in_progress`,
     `offer_data` = full offer snapshot, `assets`).
  3. Read `company_name` from `pyra_settings`. Load server fonts/logo
     (`loadServerPdfFonts`/`loadServerDefaultLogo`). Generate the 3 PDFs →
     `Buffer.from(await blob.arrayBuffer())` → `storeGeneratedDocument` ×3
     (types dt_offer_letter / dt_nda / dt_asset_handover).
  4. Seed `pyra_onboarding_tasks` from `DEFAULT_ONBOARDING_TASKS` (Task 9).
  5. `logActivity` (`${ENTITY_TYPES.X}_${ACTIVITY_ACTIONS.CREATE}`, source
     `onboarding_created`) + `notify` admin/HR + the new employee.
  6. On any post-user failure: best-effort cleanup (delete onboarding rows +
     uploaded objects; the user row stays — surface a clear partial-success error).

- [ ] Implement; `pnpm run check`; commit. (Route correctness verified in Task 11.)

---

### Task 8: Onboarding detail / status / task / regenerate routes

**Files:** Create `app/api/hr/onboarding/[id]/route.ts`,
`app/api/hr/onboarding/[id]/tasks/[taskId]/route.ts`,
`app/api/hr/onboarding/[id]/documents/[docType]/regenerate/route.ts`. All `hr.manage`.

- `GET [id]` → record + tasks (ordered) + linked documents with **`signed_url`**
  (re-sign from `storage_path`; never return `storage_path`).
- `PATCH [id]` → body `{ action: 'complete'|'cancel', notes? }`: set status +
  `completed_at`; `logActivity`.
- `PATCH [id]/tasks/[taskId]` → `{ is_done }`: cross-resource guard
  (`.eq('id', taskId).eq('onboarding_id', id)`); set `done_at`/`done_by`.
- `POST [id]/documents/[docType]/regenerate` → re-run the matching generator from
  `offer_data`/`assets`, replace the stored PDF (delete old object + row, store new).

- [ ] Implement; `pnpm run check`; commit.

---

### Task 9: Constants + types + default checklist

**Files:** Create `lib/constants/onboarding.ts`; modify `types/database.ts`.

```ts
// lib/constants/onboarding.ts
export const ONBOARDING_STATUS = { IN_PROGRESS: 'in_progress', COMPLETED: 'completed', CANCELLED: 'cancelled' } as const;
export type OnboardingStatus = typeof ONBOARDING_STATUS[keyof typeof ONBOARDING_STATUS];
export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  in_progress: 'جاري التعيين', completed: 'مكتمل', cancelled: 'ملغي',
};
export const ASSET_TYPES_AR = ['لابتوب','هاتف متحرك','خط هاتف / SIM','بطاقة دخول','كاميرا / معدات','أخرى'] as const;
export const DEFAULT_ONBOARDING_TASKS: string[] = [
  'تجهيز البريد الإلكتروني',
  'تسليم اللابتوب والعهدة',
  'توقيع عرض العمل ورفع النسخة الموقّعة',
  'توقيع اتفاقية السرية (NDA) ورفع النسخة الموقّعة',
  'توقيع نموذج تسليم العهدة ورفع النسخة الموقّعة',
  'إضافة الموظف للفرق والبوردات',
  'شرح الأنظمة والصلاحيات',
  'تفعيل المصادقة الثنائية (2FA)',
];
```
Add `PyraOnboarding` + `PyraOnboardingTask` interfaces to `types/database.ts`
matching the migration columns.

- [ ] Implement; `pnpm run check`; commit.

---

### Task 10: Hooks + UI (list, wizard, detail)

**Files:** `hooks/useOnboarding.ts`; `app/dashboard/hr/onboarding/{page.tsx,onboarding-client.tsx}`;
`app/dashboard/hr/onboarding/[id]/{page.tsx,onboarding-detail-client.tsx}`;
`components/hr/onboarding/{NewHireWizard.tsx,WizardSteps.tsx,OnboardingChecklist.tsx,OnboardingDocuments.tsx}`.

**Hooks** (React Query, `fetchAPI`/`mutateAPI`):
`useOnboardingList`, `useOnboarding(id)`, `useCreateOnboarding`,
`useUpdateOnboarding`, `useToggleOnboardingTask`, `useRegenerateDocument`.

**UI patterns to follow (read these):**
- Select with "all" sentinel (NEVER `value=""`) — see `documents-client.tsx`.
- DataTable list — see `app/dashboard/hr/documents/documents-client.tsx`.
- Multi-step form state — local `useState` step index; **`Select` items never
  empty-string**; `h-11` touch targets; RTL logical classes; dark pairs.
- Page < 300 lines → split wizard steps into `WizardSteps.tsx`.

- [ ] **Step 1:** Hooks. **Step 2:** list page + client (table + "موظف جديد" → wizard).
  **Step 3:** `NewHireWizard` (5 steps: personal / position / compensation / custom
  clauses + assets / review) → `useCreateOnboarding`. **Step 4:** detail page
  (checklist toggles + progress bar + documents list with download via signed_url +
  regenerate buttons + "إنهاء التعيين"). `pnpm run check` after each. Commit per step.

---

### Task 11: Wiring, docs, and MANDATORY live smoke

**Files:** `components/layout/sidebar.tsx`, `lib/config/module-guide.ts`,
`app/dashboard/guide/page.tsx`, `DATABASE-SCHEMA.md`, `docs/EMPLOYEE-SYSTEM.md`,
`CLAUDE.md` (locked-decisions section).

- [ ] **Step 1:** Sidebar entry (HR group, `permission: 'hr.manage'`,
  `/dashboard/hr/onboarding`). Module-guide + guide-page entries.
- [ ] **Step 2:** `DATABASE-SCHEMA.md` (2 tables) + `docs/EMPLOYEE-SYSTEM.md`
  (module/perms/hooks) + `CLAUDE.md` "Employee Onboarding — Locked Decisions".
- [ ] **Step 3 (MANDATORY live smoke):** create a test hire via the wizard on the
  deployed build; **open all 3 generated PDFs and confirm Arabic renders correctly**
  (connected letters, right-to-left order, no boxes/garbage); confirm they appear in
  the Documents Vault; toggle checklist + complete. Record results. Fix any Arabic
  rendering issues in `lib/pdf/arabic.ts` before merge.
- [ ] **Step 4:** `pnpm run check` + `pnpm test` + `pnpm build` green. Commit.

---

## Self-Review (controller)

- **Spec coverage:** wizard (T7/T10), 3 generators (T3–T5), arabic helper (T2),
  checklist (T9/T10), tables+doc-types (T1), routes (T7/T8), vault storage (T6),
  sales-vs-non-sales + custom clauses (T3), hr.manage gating (T7/T8), out-of-scope
  honored. ✓
- **Placeholder note:** the 3 generator tasks intentionally reference the persisted
  verbatim content files (offer HTML / nda-content-ar.md / asset-handover-content-ar.md)
  rather than re-inlining 3 pages of legal Arabic — those files ARE the source the
  implementer copies from (no-placeholder satisfied by durable content files).
- **Type consistency:** `OfferLetterData`/`NdaData`/`AssetHandoverData`,
  `createEmployeeUser`, `storeGeneratedDocument`, `DEFAULT_ONBOARDING_TASKS`,
  `ONBOARDING_STATUS` used consistently across tasks.
- **Risk:** `bidi-js` API specifics + jsPDF Arabic line-wrapping are the highest-risk
  area → Task 2 note + the mandatory live smoke (T11) are the nets.

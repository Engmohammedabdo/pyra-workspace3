# Public Quote Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer sign a quote from a WhatsApp link with no login, let staff record a signature obtained offline with the counter-signed PDF as evidence, and stop the quotes list showing "sent" for mail that never left.

**Architecture:** A new generic `pyra_document_links` table mints an opaque 256-bit token per document. `app/d/[token]` is a Server Component that reads through the service role — no API route on the read path, which structurally avoids the 401/envelope bugs that killed the existing `/share` feature. Only signing needs a route (`POST /api/public/quotes/[token]/sign`). All guard logic lives in pure, unit-tested modules under `lib/` consumed by both the portal and public sign paths.

**Tech Stack:** Next.js 15 App Router (RSC + client boundary), Supabase (service-role client, Storage), Vitest, next-intl, Tailwind RTL, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-27-public-quote-signing-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- The gate before every commit is **`pnpm run check`** (= `tsc --noEmit && tsx scripts/i18n-check.ts`) plus `pnpm test`. `pnpm build` runs before push. Acceptance criteria cite `check`, not `build`.
- `app/dashboard/quotes`, `components/quotes` and `app/api/quotes` **are in** `MIGRATED_PATHS` — every new string in those trees must be a catalog key in **both** `messages/ar` and `messages/en`. Raw Arabic there fails the gate.
- RTL only: `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right`.
- Every `bg-{c}-50/100` and `text-{c}-600/700` needs its `dark:` pair.
- No raw `fetch()` in components. Sanctioned exemptions in this plan: **the FormData evidence upload only**.
- `fetchAPI()` already unwraps `.data` — never read `.data` again on its result.
- Never `INSERT INTO pyra_notifications` directly — always `notify()` / `notifyMany()`.
- Migration files are **immutable after apply**. A correction ships as the next number.
- Non-ASCII SQL must live in a UTF-8 `.sql` file, never inline on the command line.
- New table gets `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon, authenticated` + `GRANT ALL TO service_role`. **Never** grant `anon`.
- Owner decisions D-1..D-4 are locked: no bank details on the public PDF; append-only signature trigger as partial mitigation; email the signer a copy; move `QuoteDetailView` into `components/quotes/` and translate it.

---

## File Structure

**Create — pure logic (Task 1):**
- `lib/documents/link-state.ts` — link validity classification
- `lib/documents/token.ts` — CSPRNG token generation
- `lib/quotes/signability.ts` — can-this-quote-be-signed, single source of truth
- `lib/quotes/public-payload.ts` — the explicit public allowlist
- `lib/quotes/content-hash.ts` — stable hash binding a link to its content
- `lib/quotes/delivery.ts` — email result → stored delivery status
- `lib/quotes/evidence-upload.ts` — file validation + PDF magic bytes
- `__tests__/document-link-state.test.ts`, `__tests__/quote-signability.test.ts`, `__tests__/quote-public-payload.test.ts`, `__tests__/quote-content-hash.test.ts`, `__tests__/quote-delivery.test.ts`, `__tests__/document-link-token.test.ts`, `__tests__/quote-evidence-upload.test.ts`

**Create — DB (Task 2):**
- `supabase/migrations/054_pyra_document_links.sql`

**Modify — hardening (Task 3):**
- `app/api/quotes/[id]/route.ts` — block content mutation on signed/invoiced

**Create — shared sign core (Task 4):**
- `lib/quotes/sign-quote.ts`
- Modify `app/api/portal/quotes/[id]/sign/route.ts` to consume it

**Modify + create — public read path (Task 5):**
- `middleware.ts` — one inserted line
- `app/d/[token]/page.tsx`, `app/d/[token]/public-quote-view.tsx`
- Move `components/portal/quotes/QuoteDetailView.tsx` → `components/quotes/QuoteDetailView.tsx`

**Create — public sign (Task 6):**
- `app/api/public/quotes/[token]/sign/route.ts`

**Create — link management (Task 7):**
- `app/api/quotes/[id]/link/route.ts`, `hooks/useDocumentLinks.ts`, `components/quotes/PublicLinkDialog.tsx`

**Create — offline attestation (Task 8):**
- `app/api/quotes/[id]/offline-signature/route.ts`, `app/api/quotes/[id]/offline-signature/evidence/route.ts`, `components/quotes/OfflineSignDialog.tsx`, `hooks/useOfflineSignature.ts`

**Modify — delivery status (Task 9):**
- `app/api/quotes/[id]/send/route.ts`, `app/dashboard/quotes/quotes-client.tsx`

**Modify — docs (Task 10):**
- `scripts/i18n-check.ts`, `DATABASE-SCHEMA.md`, `CLAUDE.md`, `docs/decisions/finance.md`

---

## Task 1: Pure logic core + tests

No behaviour change anywhere. Everything here is imported by later tasks.

**Files:**
- Create: `lib/documents/link-state.ts`, `lib/documents/token.ts`, `lib/quotes/signability.ts`, `lib/quotes/public-payload.ts`, `lib/quotes/content-hash.ts`, `lib/quotes/delivery.ts`, `lib/quotes/evidence-upload.ts`
- Test: `__tests__/document-link-state.test.ts`, `__tests__/quote-signability.test.ts`, `__tests__/quote-public-payload.test.ts`, `__tests__/quote-content-hash.test.ts`, `__tests__/quote-delivery.test.ts`, `__tests__/document-link-token.test.ts`, `__tests__/quote-evidence-upload.test.ts`

**Interfaces:**
- Consumes: `QUOTE_STATUS` from `lib/constants/statuses.ts`; `dubaiDayKey` from `lib/utils/date` (confirm the exact export path with `grep -rn "export function dubaiDayKey" lib/` before importing).
- Produces:
  - `classifyLinkState(link, nowIso): 'valid' | 'expired' | 'revoked'`
  - `generateDocumentLinkToken(): string`
  - `canSignQuote(quote, todayKey): { ok: true } | { ok: false; reason: SignBlockReason }`
  - `toPublicQuotePayload(row, items): PublicQuotePayload`
  - `quoteContentHash(payload: PublicQuotePayload): string`
  - `deriveDelivery(email): { delivery_status: DeliveryStatus; delivery_detail: string | null }`
  - `validateEvidenceFile(file): { ok: true; ext: string } | { ok: false; reason: 'too_large' | 'bad_mime' }`
  - `isPdfMagic(head: Uint8Array): boolean`

- [ ] **Step 1: Confirm the dubaiDayKey export before writing code that imports it**

Run:
```bash
grep -rn "export function dubaiDayKey\|export const dubaiDayKey" lib/
```
Expected: exactly one hit. Note the file path — use it verbatim in Step 6. If there is no hit, search `grep -rn "dubaiDayKey" lib/ | head` and use whatever module actually exports it. Do not invent the path.

- [ ] **Step 2: Write the failing test for link state**

Create `__tests__/document-link-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyLinkState } from '@/lib/documents/link-state';

const NOW = '2026-07-27T12:00:00.000Z';

describe('classifyLinkState', () => {
  it('treats a null expiry as valid forever', () => {
    expect(classifyLinkState({ expires_at: null, revoked_at: null }, NOW)).toBe('valid');
  });

  it('is valid while expires_at is in the future', () => {
    expect(
      classifyLinkState({ expires_at: '2026-07-28T00:00:00.000Z', revoked_at: null }, NOW),
    ).toBe('valid');
  });

  it('is expired once expires_at has passed', () => {
    expect(
      classifyLinkState({ expires_at: '2026-07-27T11:59:59.000Z', revoked_at: null }, NOW),
    ).toBe('expired');
  });

  it('treats an exact-boundary expiry as expired', () => {
    expect(classifyLinkState({ expires_at: NOW, revoked_at: null }, NOW)).toBe('expired');
  });

  it('lets revoked win over expired', () => {
    expect(
      classifyLinkState(
        { expires_at: '2020-01-01T00:00:00.000Z', revoked_at: '2026-07-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('revoked');
  });

  it('is revoked even when not expired', () => {
    expect(
      classifyLinkState({ expires_at: null, revoked_at: '2026-07-26T00:00:00.000Z' }, NOW),
    ).toBe('revoked');
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm test document-link-state`
Expected: FAIL — cannot resolve `@/lib/documents/link-state`.

- [ ] **Step 4: Implement link-state**

Create `lib/documents/link-state.ts`:

```ts
/**
 * Validity of a public document link, independent of the document it points at.
 *
 * Revocation wins over expiry: a link an admin deliberately killed must never
 * report itself as merely "expired", because the two states get different
 * operator handling even though callers render them identically (S-10).
 */
export type LinkState = 'valid' | 'expired' | 'revoked';

export interface DocumentLinkTiming {
  expires_at: string | null;
  revoked_at: string | null;
}

/** `expires_at: null` means the link never expires — a deliberate product choice. */
export function classifyLinkState(link: DocumentLinkTiming, nowIso: string): LinkState {
  if (link.revoked_at) return 'revoked';
  if (!link.expires_at) return 'valid';
  // Boundary is inclusive: a link expiring exactly now is already expired.
  return Date.parse(link.expires_at) <= Date.parse(nowIso) ? 'expired' : 'valid';
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `pnpm test document-link-state`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write the failing test for signability**

Create `__tests__/quote-signability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canSignQuote } from '@/lib/quotes/signability';

const TODAY = '2026-07-27';

describe('canSignQuote', () => {
  it('allows a sent quote', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: null }, TODAY)).toEqual({ ok: true });
  });

  it('allows a viewed quote', () => {
    expect(canSignQuote({ status: 'viewed', expiry_date: null }, TODAY)).toEqual({ ok: true });
  });

  it('reports already_signed for a signed quote', () => {
    expect(canSignQuote({ status: 'signed', expiry_date: null }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });

  it('reports already_signed for an invoiced quote', () => {
    expect(canSignQuote({ status: 'invoiced', expiry_date: null }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });

  it.each(['draft', 'pending_approval', 'rejected', 'expired', 'cancelled'])(
    'blocks status %s as wrong_status',
    (status) => {
      expect(canSignQuote({ status, expiry_date: null }, TODAY)).toEqual({
        ok: false,
        reason: 'wrong_status',
      });
    },
  );

  it('still allows signing on the expiry date itself', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: TODAY }, TODAY)).toEqual({ ok: true });
  });

  it('blocks the day after expiry', () => {
    expect(canSignQuote({ status: 'sent', expiry_date: '2026-07-26' }, TODAY)).toEqual({
      ok: false,
      reason: 'quote_expired',
    });
  });

  it('checks status before expiry so a signed expired quote reads as signed', () => {
    expect(canSignQuote({ status: 'signed', expiry_date: '2020-01-01' }, TODAY)).toEqual({
      ok: false,
      reason: 'already_signed',
    });
  });
});
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `pnpm test quote-signability`
Expected: FAIL — cannot resolve `@/lib/quotes/signability`.

- [ ] **Step 8: Implement signability**

Create `lib/quotes/signability.ts`:

```ts
import { QUOTE_STATUS } from '@/lib/constants/statuses';

/**
 * The single source of truth for "may this quote be signed right now".
 *
 * Both the portal sign route and the public sign route call this, and the UI
 * derives its `canSign` prop from the same function. Before this existed the
 * API guard and the view's own check could disagree, which is how a customer
 * could be shown a sign button that then 422'd.
 */
export type SignBlockReason = 'already_signed' | 'wrong_status' | 'quote_expired';

export interface SignableQuote {
  status: string;
  /** DATE column — 'YYYY-MM-DD', compared against a Dubai day key. */
  expiry_date: string | null;
}

const SIGNABLE_STATUSES: readonly string[] = [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED];
const TERMINAL_SIGNED: readonly string[] = [QUOTE_STATUS.SIGNED, QUOTE_STATUS.INVOICED];

export function canSignQuote(
  quote: SignableQuote,
  todayKey: string,
): { ok: true } | { ok: false; reason: SignBlockReason } {
  // Status is checked first: an already-signed quote reports "signed", never
  // "expired", so the customer is not told to ask for a new quote they do not need.
  if (TERMINAL_SIGNED.includes(quote.status)) return { ok: false, reason: 'already_signed' };
  if (!SIGNABLE_STATUSES.includes(quote.status)) return { ok: false, reason: 'wrong_status' };
  // Inclusive: a quote expiring today is still signable today. Mirrors the
  // existing portal guard so behaviour does not change for portal signers.
  if (quote.expiry_date && quote.expiry_date < todayKey) {
    return { ok: false, reason: 'quote_expired' };
  }
  return { ok: true };
}
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `pnpm test quote-signability`
Expected: PASS, 12 tests (the `it.each` expands to 5).

- [ ] **Step 10: Write the failing test for the public payload allowlist**

Create `__tests__/quote-public-payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toPublicQuotePayload, PUBLIC_QUOTE_FIELDS } from '@/lib/quotes/public-payload';

const ROW = {
  id: 'qt_1',
  quote_number: 'QT-0031',
  status: 'sent',
  currency: 'AED',
  subtotal: 11997,
  tax_rate: 0,
  tax_amount: 0,
  discount_type: null,
  discount_value: null,
  discount_amount: null,
  total: 11997,
  estimate_date: '2026-07-25',
  expiry_date: '2026-08-25',
  notes: null,
  terms_conditions: [],
  company_name: 'Pyramedia X',
  company_logo: null,
  client_name: 'Majed Alsaleh',
  client_company: 'ELITE TRACK CARS',
  signed_at: null,
  signed_by: null,
  // Everything below MUST be dropped.
  client_email: 'ali@example.com',
  client_phone: '0527412990',
  client_address: 'Dubai Marina',
  client_id: 'cl_1',
  lead_id: 'sl_1',
  created_by: 'elharm',
  signed_ip: '1.2.3.4',
  license_no: 'LIC-123',
  entity_id: 'be_1',
  bank_details: { bank: 'Emirates NBD', iban: 'AE07...' },
};

const ITEMS = [{ description: 'Offer', quantity: 3, rate: 3999, amount: 11997 }];

describe('toPublicQuotePayload', () => {
  it('emits exactly the allowlisted keys', () => {
    const payload = toPublicQuotePayload(ROW, ITEMS);
    expect(Object.keys(payload).sort()).toEqual([...PUBLIC_QUOTE_FIELDS, 'items'].sort());
  });

  it.each([
    'client_email',
    'client_phone',
    'client_address',
    'client_id',
    'lead_id',
    'created_by',
    'signed_ip',
    'license_no',
    'entity_id',
    'bank_details',
  ])('never leaks %s', (key) => {
    expect(toPublicQuotePayload(ROW, ITEMS)).not.toHaveProperty(key);
  });

  it('passes items through unchanged', () => {
    expect(toPublicQuotePayload(ROW, ITEMS).items).toEqual(ITEMS);
  });

  it('produces the same keys even when the row is missing optional fields', () => {
    const sparse = { id: 'qt_2', quote_number: 'QT-1', status: 'sent', total: 0 };
    expect(Object.keys(toPublicQuotePayload(sparse, [])).sort()).toEqual(
      [...PUBLIC_QUOTE_FIELDS, 'items'].sort(),
    );
  });
});
```

- [ ] **Step 11: Run it and confirm it fails**

Run: `pnpm test quote-public-payload`
Expected: FAIL — cannot resolve `@/lib/quotes/public-payload`.

- [ ] **Step 12: Implement the public payload**

Create `lib/quotes/public-payload.ts`:

```ts
/**
 * The explicit allowlist of quote fields that may cross onto an unauthenticated,
 * forwardable URL.
 *
 * This is an allowlist and not an omit-list on purpose: a future `select *` on
 * the public route adds columns to the row but cannot add them to the payload,
 * and the unit test pins the key set so the change fails CI instead of shipping.
 *
 * Deliberately absent (owner decision D-1): `bank_details`. Publishing the
 * company IBAN on a link anyone can forward is an invoice-fraud kit.
 */
export const PUBLIC_QUOTE_FIELDS = [
  'id',
  'quote_number',
  'status',
  'currency',
  'subtotal',
  'tax_rate',
  'tax_amount',
  'discount_type',
  'discount_value',
  'discount_amount',
  'total',
  'estimate_date',
  'expiry_date',
  'notes',
  'terms_conditions',
  'company_name',
  'company_logo',
  'client_name',
  'client_company',
  'signed_at',
  'signed_by',
] as const;

export type PublicQuoteField = (typeof PUBLIC_QUOTE_FIELDS)[number];

export interface PublicQuoteItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type PublicQuotePayload = Record<PublicQuoteField, unknown> & {
  items: PublicQuoteItem[];
};

export function toPublicQuotePayload(
  row: Record<string, unknown>,
  items: PublicQuoteItem[],
): PublicQuotePayload {
  const out = {} as PublicQuotePayload;
  for (const key of PUBLIC_QUOTE_FIELDS) {
    (out as Record<string, unknown>)[key] = row[key] ?? null;
  }
  out.items = items;
  return out;
}
```

- [ ] **Step 13: Run it and confirm it passes**

Run: `pnpm test quote-public-payload`
Expected: PASS, 13 tests.

- [ ] **Step 14: Write the failing test for content hash**

Create `__tests__/quote-content-hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';

const base = () =>
  toPublicQuotePayload(
    { id: 'qt_1', quote_number: 'QT-1', total: 100, currency: 'AED', tax_rate: 0 },
    [{ description: 'A', quantity: 1, rate: 100, amount: 100 }],
  );

describe('quoteContentHash', () => {
  it('is stable for identical content', () => {
    expect(quoteContentHash(base())).toBe(quoteContentHash(base()));
  });

  it('returns a 64-char hex digest', () => {
    expect(quoteContentHash(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a line rate changes', () => {
    const changed = base();
    changed.items = [{ description: 'A', quantity: 1, rate: 150, amount: 150 }];
    expect(quoteContentHash(changed)).not.toBe(quoteContentHash(base()));
  });

  it('changes when the total changes', () => {
    const changed = base();
    (changed as Record<string, unknown>).total = 200;
    expect(quoteContentHash(changed)).not.toBe(quoteContentHash(base()));
  });

  it('ignores the signature fields, which move without the price moving', () => {
    const signed = base();
    (signed as Record<string, unknown>).signed_at = '2026-07-27T00:00:00.000Z';
    (signed as Record<string, unknown>).signed_by = 'Majed';
    expect(quoteContentHash(signed)).toBe(quoteContentHash(base()));
  });

  it('ignores status, which flips sent -> viewed on the first open', () => {
    const viewed = base();
    (viewed as Record<string, unknown>).status = 'viewed';
    expect(quoteContentHash(viewed)).toBe(quoteContentHash(base()));
  });
});
```

- [ ] **Step 15: Run it and confirm it fails**

Run: `pnpm test quote-content-hash`
Expected: FAIL — cannot resolve `@/lib/quotes/content-hash`.

- [ ] **Step 16: Implement content hash**

Create `lib/quotes/content-hash.ts`:

```ts
import { createHash } from 'crypto';
import type { PublicQuotePayload } from './public-payload';

/**
 * Binds a public link to the commercial content it was minted for (S-8).
 *
 * Deliberately excludes `status`, `signed_at` and `signed_by`: those move during
 * the normal life of a link (sent -> viewed on first open, then signed) without
 * the customer's offer changing. Hashing them would invalidate every link the
 * moment it was opened.
 */
const VOLATILE_FIELDS = new Set(['status', 'signed_at', 'signed_by']);

export function quoteContentHash(payload: PublicQuotePayload): string {
  const stable: Record<string, unknown> = {};
  // Sort keys so the digest is independent of property insertion order.
  for (const key of Object.keys(payload).sort()) {
    if (VOLATILE_FIELDS.has(key)) continue;
    stable[key] = (payload as Record<string, unknown>)[key];
  }
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
```

- [ ] **Step 17: Run it and confirm it passes**

Run: `pnpm test quote-content-hash`
Expected: PASS, 6 tests.

- [ ] **Step 18: Write the failing test for delivery derivation**

Create `__tests__/quote-delivery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveDelivery } from '@/lib/quotes/delivery';

describe('deriveDelivery', () => {
  it('marks a successful send as delivered and records the recipient', () => {
    expect(deriveDelivery({ sent: true, to: 'a@b.com' })).toEqual({
      delivery_status: 'delivered',
      delivery_detail: 'a@b.com',
    });
  });

  it('marks a missing address as no_email', () => {
    expect(deriveDelivery({ sent: false, reason: 'no_email' })).toEqual({
      delivery_status: 'no_email',
      delivery_detail: null,
    });
  });

  it('marks an SMTP failure as not_delivered', () => {
    expect(deriveDelivery({ sent: false, reason: 'not_delivered', to: 'a@b.com' })).toEqual({
      delivery_status: 'not_delivered',
      delivery_detail: 'a@b.com',
    });
  });

  it('defaults an unexplained failure to not_delivered rather than delivered', () => {
    expect(deriveDelivery({ sent: false })).toEqual({
      delivery_status: 'not_delivered',
      delivery_detail: null,
    });
  });

  it('does not claim delivery when sent is true but no recipient is known', () => {
    expect(deriveDelivery({ sent: true })).toEqual({
      delivery_status: 'delivered',
      delivery_detail: null,
    });
  });
});
```

- [ ] **Step 19: Run it and confirm it fails**

Run: `pnpm test quote-delivery`
Expected: FAIL — cannot resolve `@/lib/quotes/delivery`.

- [ ] **Step 20: Implement delivery derivation**

Create `lib/quotes/delivery.ts`:

```ts
/**
 * Turns the send route's honest email result into the value we persist.
 *
 * The send route has always computed this and thrown it away, so the quotes
 * list showed "sent" for mail that never left. Keeping the derivation in one
 * tested function keeps the stored badge and the three existing toasts in
 * provable agreement.
 */
export type DeliveryStatus = 'delivered' | 'no_email' | 'not_delivered';

export interface EmailOutcome {
  sent: boolean;
  reason?: 'no_email' | 'not_delivered';
  to?: string;
}

export function deriveDelivery(email: EmailOutcome): {
  delivery_status: DeliveryStatus;
  delivery_detail: string | null;
} {
  const detail = email.to ?? null;
  if (email.sent) return { delivery_status: 'delivered', delivery_detail: detail };
  if (email.reason === 'no_email') return { delivery_status: 'no_email', delivery_detail: null };
  // Fail pessimistic: an unexplained failure must never read as delivered.
  return { delivery_status: 'not_delivered', delivery_detail: detail };
}
```

- [ ] **Step 21: Run it and confirm it passes**

Run: `pnpm test quote-delivery`
Expected: PASS, 5 tests.

- [ ] **Step 22: Write the failing test for token generation**

Create `__tests__/document-link-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateDocumentLinkToken } from '@/lib/documents/token';

describe('generateDocumentLinkToken', () => {
  it('fits the varchar(64) column', () => {
    expect(generateDocumentLinkToken().length).toBeLessThanOrEqual(64);
  });

  it('uses only URL-safe characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateDocumentLinkToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries at least 256 bits of entropy (43 base64url chars)', () => {
    expect(generateDocumentLinkToken().length).toBeGreaterThanOrEqual(43);
  });

  it('does not collide across 10k samples', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateDocumentLinkToken());
    expect(seen.size).toBe(10_000);
  });
});
```

- [ ] **Step 23: Run it and confirm it fails**

Run: `pnpm test document-link-token`
Expected: FAIL — cannot resolve `@/lib/documents/token`.

- [ ] **Step 24: Implement token generation**

Create `lib/documents/token.ts`:

```ts
import { randomBytes } from 'crypto';

/**
 * 256-bit CSPRNG token for a public document link.
 *
 * NOT `generateId()`: its 20-char cap exists to fit `varchar(20)` id columns and
 * yields ~96 bits, which is too short for a link that can legally bind a
 * customer. base64url keeps it copy-pasteable into WhatsApp without escaping.
 */
export function generateDocumentLinkToken(): string {
  return randomBytes(32).toString('base64url');
}
```

- [ ] **Step 25: Run it and confirm it passes**

Run: `pnpm test document-link-token`
Expected: PASS, 4 tests.

- [ ] **Step 26: Write the failing test for evidence validation**

Create `__tests__/quote-evidence-upload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  validateEvidenceFile,
  isPdfMagic,
  MAX_EVIDENCE_BYTES,
} from '@/lib/quotes/evidence-upload';

describe('validateEvidenceFile', () => {
  it('accepts a PDF under the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: 1024 })).toEqual({
      ok: true,
      ext: 'pdf',
    });
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: MAX_EVIDENCE_BYTES })).toEqual({
      ok: true,
      ext: 'pdf',
    });
  });

  it('rejects one byte over the cap', () => {
    expect(validateEvidenceFile({ type: 'application/pdf', size: MAX_EVIDENCE_BYTES + 1 })).toEqual(
      { ok: false, reason: 'too_large' },
    );
  });

  it('rejects SVG, which can carry script', () => {
    expect(validateEvidenceFile({ type: 'image/svg+xml', size: 100 })).toEqual({
      ok: false,
      reason: 'bad_mime',
    });
  });

  it('rejects an unknown MIME type', () => {
    expect(validateEvidenceFile({ type: 'application/zip', size: 100 })).toEqual({
      ok: false,
      reason: 'bad_mime',
    });
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('maps %s to exactly one canonical extension', (mime, ext) => {
    expect(validateEvidenceFile({ type: mime, size: 100 })).toEqual({ ok: true, ext });
  });
});

describe('isPdfMagic', () => {
  it('accepts a real PDF header', () => {
    expect(isPdfMagic(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
  });

  it('rejects a JPEG header', () => {
    expect(isPdfMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(false);
  });

  it('rejects a buffer shorter than the magic bytes', () => {
    expect(isPdfMagic(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});
```

- [ ] **Step 27: Run it and confirm it fails**

Run: `pnpm test quote-evidence-upload`
Expected: FAIL — cannot resolve `@/lib/quotes/evidence-upload`.

- [ ] **Step 28: Implement evidence validation**

Create `lib/quotes/evidence-upload.ts`:

```ts
/**
 * Validation for the counter-signed PDF stored as proof of an offline signature.
 *
 * The cap is the `pyra-private` BUCKET limit (10 MiB), not the 20 MB the HR
 * upload dialog advertises — exceeding the bucket limit fails inside Supabase
 * with a generic error the user cannot act on.
 *
 * The extension is derived from the MIME map, never from the user's filename:
 * a filename is attacker-controlled and a mismatched extension is how a stored
 * file gets served as the wrong type.
 */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

/** SVG is deliberately absent — it can carry <script> (XSS). */
export const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateEvidenceFile(file: { type: string; size: number }):
  | { ok: true; ext: string }
  | { ok: false; reason: 'too_large' | 'bad_mime' } {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) return { ok: false, reason: 'bad_mime' };
  if (file.size > MAX_EVIDENCE_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true, ext };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // '%PDF-'

/** Content sniffing: `file.type` is client-supplied and trivially spoofed. */
export function isPdfMagic(head: Uint8Array): boolean {
  if (head.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((byte, i) => head[i] === byte);
}
```

- [ ] **Step 29: Run the whole suite and the type gate**

Run:
```bash
pnpm test && pnpm run check
```
Expected: all suites pass (7 new files), `tsc --noEmit` clean, `i18n-check` clean. No new strings were added to a migrated path in this task, so i18n cannot regress here.

- [ ] **Step 30: Commit**

```bash
git add lib/documents lib/quotes __tests__
git commit -m "feat(quotes): pure core for public signing links

Guard logic the sign paths will share, extracted before any of it is wired
so the behaviour is pinned by tests first. The sign path has zero test
coverage today, so extracting it unguarded would have been a silent rewrite.

canSignQuote becomes the single source of truth for both the API guard and
the view's canSign prop, which today can disagree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 054

**Files:**
- Create: `supabase/migrations/054_pyra_document_links.sql`
- Modify: `types/database.ts` (add `PyraDocumentLink`, extend the quote type)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; the column CHECK values must match `DeliveryStatus` and the `signature_source` union.
- Produces: table `pyra_document_links`, RPC `pyra_increment_document_link_view(text)`, 12 new nullable columns on `pyra_quotes`, TS type `PyraDocumentLink`.

- [ ] **Step 1: Record the drift baseline before touching anything**

Run: `pnpm db:check-drift`
Expected: exit code 1, reporting **exactly one** MISSING: `036_push_subscriptions`. Copy the output into the commit message.

If it reports anything other than exactly that one missing entry, STOP and report to the user — the baseline has changed and this plan's assumption is stale.

- [ ] **Step 2: Take a pre-migration backup**

Run: `pnpm db:backup pre-054`
Expected: a snapshot file path printed. If the command fails because `SUPABASE_DB_URL` is missing (a known gap), note it in the commit message and continue — this migration is additive only (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`) and drops nothing.

- [ ] **Step 3: Read the migration template**

Run: `cat supabase/migrations/_template.sql`
Expected: a header block with Phase / Author / Date / Reversible / Touches data / Risk tier / Purpose / Idempotency contract. Reproduce that header shape in Step 4 — do not invent a different one.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/054_pyra_document_links.sql`. Fill the header fields to match the template you just read, then the body:

```sql
-- Phase:            Public quote signing
-- Author:           <your username>
-- Date:             2026-07-27
-- Reversible:       No (forward-only; additive)
-- Touches data:     No (schema only)
-- Risk tier:        Low
-- Purpose:          Public document links + offline signature evidence + honest delivery status
-- Idempotency:      Every statement is IF NOT EXISTS / OR REPLACE; safe to re-run.

CREATE TABLE IF NOT EXISTS public.pyra_document_links (
  id             text PRIMARY KEY,
  entity_type    text        NOT NULL CHECK (entity_type IN ('quote','invoice','contract')),
  entity_id      text        NOT NULL,
  token          varchar(64) NOT NULL,
  content_hash   text        NULL,
  expires_at     timestamptz NULL,
  revoked_at     timestamptz NULL,
  revoked_by     text        NULL,
  view_count     integer     NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  last_viewed_at timestamptz NULL,
  created_by     text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pyra_document_links IS
  'Opaque public links for customer-facing documents. Service-role only; tokens must never be selected into a list response.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_links_token
  ON public.pyra_document_links (token);
CREATE INDEX IF NOT EXISTS idx_document_links_entity
  ON public.pyra_document_links (entity_type, entity_id);
-- At most one live link per document, so "the link" is unambiguous for sales
-- and revoke-on-edit is trivially correct.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_links_one_live
  ON public.pyra_document_links (entity_type, entity_id) WHERE revoked_at IS NULL;

ALTER TABLE public.pyra_document_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pyra_document_links FROM anon, authenticated;
GRANT ALL  ON TABLE public.pyra_document_links TO service_role;

-- Atomic counter. A read-modify-write from JS would lose concurrent views and
-- would also require granting UPDATE somewhere it does not belong.
CREATE OR REPLACE FUNCTION public.pyra_increment_document_link_view(link_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.pyra_document_links
     SET view_count = view_count + 1,
         last_viewed_at = now()
   WHERE id = link_id;
$$;

-- 038_function_execute_acl.sql revoked default EXECUTE, so a new function is
-- not born executable and the counter would silently fail without this grant.
REVOKE ALL ON FUNCTION public.pyra_increment_document_link_view(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_increment_document_link_view(text) TO service_role;

ALTER TABLE public.pyra_quotes
  ADD COLUMN IF NOT EXISTS delivery_status      text NULL
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','no_email','not_delivered')),
  ADD COLUMN IF NOT EXISTS delivery_detail      text NULL,
  ADD COLUMN IF NOT EXISTS delivery_checked_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signature_source     text NULL
      CHECK (signature_source IS NULL OR signature_source IN ('portal','public_link','offline')),
  ADD COLUMN IF NOT EXISTS signed_link_id       text NULL,
  ADD COLUMN IF NOT EXISTS signed_user_agent    text NULL,
  ADD COLUMN IF NOT EXISTS signed_offline_by    text NULL,
  ADD COLUMN IF NOT EXISTS signed_offline_at    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_path text NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_mime text NULL,
  ADD COLUMN IF NOT EXISTS signed_evidence_size integer NULL,
  ADD COLUMN IF NOT EXISTS signed_snapshot      jsonb NULL;

-- Owner decision D-2: pyra_quotes has RLS off and grants `authenticated` UPDATE,
-- so a direct PostgREST PATCH can forge a signature. A full revoke needs its own
-- read-path audit (Gap #3) and must never precede the code change. This trigger
-- is the partial mitigation: signature columns are append-only once written.
CREATE OR REPLACE FUNCTION public.pyra_quotes_signature_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.signature_data IS NOT NULL AND NEW.signature_data IS DISTINCT FROM OLD.signature_data THEN
    RAISE EXCEPTION 'signature_data is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'signed_at is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_by IS NOT NULL AND NEW.signed_by IS DISTINCT FROM OLD.signed_by THEN
    RAISE EXCEPTION 'signed_by is append-only once set (quote %)', OLD.id;
  END IF;
  IF OLD.signed_ip IS NOT NULL AND NEW.signed_ip IS DISTINCT FROM OLD.signed_ip THEN
    RAISE EXCEPTION 'signed_ip is append-only once set (quote %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pyra_quotes_signature_append_only ON public.pyra_quotes;
CREATE TRIGGER trg_pyra_quotes_signature_append_only
  BEFORE UPDATE ON public.pyra_quotes
  FOR EACH ROW EXECUTE FUNCTION public.pyra_quotes_signature_append_only();
```

- [ ] **Step 5: Apply the migration**

Run: `pnpm db:query supabase/migrations/054_pyra_document_links.sql`
Expected: no error output.

- [ ] **Step 6: Verify it actually worked — do NOT skip this**

`docs/MIGRATIONS.md:226` is explicit: recording without verifying creates fake success entries that drift detection then trusts.

Create a scratch file `verify-054.sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pyra_document_links')            AS link_cols,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname='public' AND tablename='pyra_document_links')               AS link_indexes,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid='public.pyra_document_links'::regclass)                            AS rls_on,
  (SELECT string_agg(DISTINCT grantee, ',' ORDER BY grantee)
     FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='pyra_document_links')            AS grantees,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pyra_quotes'
       AND column_name IN ('delivery_status','delivery_detail','delivery_checked_at',
                           'signature_source','signed_link_id','signed_user_agent',
                           'signed_offline_by','signed_offline_at','signed_evidence_path',
                           'signed_evidence_mime','signed_evidence_size','signed_snapshot')) AS quote_new_cols,
  (SELECT count(*) FROM pg_trigger
     WHERE tgrelid='public.pyra_quotes'::regclass
       AND tgname='trg_pyra_quotes_signature_append_only')                        AS sig_trigger;
```

Run: `pnpm db:query verify-054.sql`

Expected exactly:
- `link_cols` = 12
- `link_indexes` = 4 (PK + 3 created)
- `rls_on` = true
- `grantees` contains **no** `anon` and **no** `authenticated`
- `quote_new_cols` = 12
- `sig_trigger` = 1

If any value differs, fix forward in `055_*.sql` — 054 is immutable once applied.

- [ ] **Step 7: Prove the append-only trigger actually fires**

Create `verify-054-trigger.sql`:

```sql
DO $$
DECLARE ok boolean := false;
BEGIN
  INSERT INTO public.pyra_quotes (id, quote_number, status, total, signature_data, signed_by)
  VALUES ('qt_trigtest', 'QT-TRIGTEST', 'signed', 1, 'sig-original', 'Tester');
  BEGIN
    UPDATE public.pyra_quotes SET signature_data = 'forged' WHERE id = 'qt_trigtest';
  EXCEPTION WHEN others THEN ok := true;
  END;
  DELETE FROM public.pyra_quotes WHERE id = 'qt_trigtest';
  IF NOT ok THEN RAISE EXCEPTION 'TRIGGER DID NOT FIRE — signature is still forgeable'; END IF;
  RAISE NOTICE 'trigger verified';
END $$;
```

Run: `pnpm db:query verify-054-trigger.sql`
Expected: `NOTICE: trigger verified`, and no leftover row (confirm with `SELECT count(*) FROM pyra_quotes WHERE id='qt_trigtest'` → 0).

- [ ] **Step 8: Record the migration with the verification output**

```bash
pnpm db:record 054_pyra_document_links --by=<your-username> --notes="link_cols=12 link_indexes=4 rls_on=t grantees=postgres,service_role,supabase_admin quote_new_cols=12 sig_trigger=1; append-only trigger verified to reject a forged signature_data update"
```
Expected: success. Then `pnpm db:check-drift` returns to the documented baseline — **exactly one** MISSING (036) and nothing else.

- [ ] **Step 9: Add the TypeScript types**

In `types/database.ts`, add:

```ts
export interface PyraDocumentLink {
  id: string;
  entity_type: 'quote' | 'invoice' | 'contract';
  entity_id: string;
  token: string;
  content_hash: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string;
  created_at: string;
}
```

Then find the existing quote interface (`grep -n "interface Quote\|quote_number" types/database.ts`) and add the 12 new optional fields to it, all `| null`, matching the SQL names exactly.

- [ ] **Step 10: Type gate**

Run: `pnpm run check`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/054_pyra_document_links.sql types/database.ts
git commit -m "feat(db): document links table + quote signature/delivery columns

Applied and verified against production before recording, per MIGRATIONS.md:
recording an unverified migration creates a fake success entry that drift
detection then trusts.

The table is service-role-only from birth (RLS on, anon and authenticated
revoked). It holds signing tokens, and the comparable pyra_share_links today
has RLS off with full DML granted to authenticated.

Also ships the append-only signature trigger (owner decision D-2): pyra_quotes
grants authenticated UPDATE with RLS off, so a direct PostgREST PATCH can
currently forge a signature with no trace. The trigger is a partial mitigation
until the Gap #3 read-path audit lands.

Drift baseline before and after: exactly one MISSING (036_push_subscriptions),
pre-existing and unrelated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Block content mutation on signed quotes

Highest-severity item and fully independent — ship it early. Today `PATCH /api/quotes/[id]` silently re-prices a signed quote while leaving `signature_data` and `signed_at` intact.

**Files:**
- Modify: `app/api/quotes/[id]/route.ts`
- Modify: `messages/ar/api.json`, `messages/en/api.json`

**Interfaces:**
- Consumes: `QUOTE_STATUS` from `lib/constants/statuses.ts`.
- Produces: a 422 on content mutation of `signed`/`invoiced` quotes. Task 7 depends on this being in place before it auto-revokes links on edit.

- [ ] **Step 1: Read the current PATCH handler end to end**

Run: `sed -n '150,320p' "app/api/quotes/[id]/route.ts"`
Expected: you can name the variable holding the loaded quote (the spec cites `existing`), the update payload construction, and the point where `pyra_quote_items` are replaced. Write those line numbers down — the guard goes immediately after the quote is loaded and before any write.

- [ ] **Step 2: Add the guard**

Immediately after the existing quote row is loaded and the not-found check, insert:

```ts
    // A signed quote is a commercial commitment. Changing its price or lines
    // after the customer signed leaves signature_data and signed_at pointing at
    // content that no longer exists — which makes the signature worthless and
    // hands the customer a repudiation defence.
    // Status-only transitions (e.g. signed -> invoiced) stay allowed.
    const CONTENT_KEYS = [
      'items', 'subtotal', 'total', 'tax_rate', 'tax_amount', 'currency',
      'discount_type', 'discount_value', 'discount_amount',
      'expiry_date', 'terms_conditions', 'notes',
      'client_name', 'client_company', 'client_email', 'client_phone', 'client_address',
    ] as const;
    const LOCKED_STATUSES: readonly string[] = [QUOTE_STATUS.SIGNED, QUOTE_STATUS.INVOICED];
    if (LOCKED_STATUSES.includes(existing.status)) {
      const attempted = CONTENT_KEYS.filter((k) => k in body);
      if (attempted.length > 0) {
        return apiValidationError(t('quotes.signedContentLocked', { fields: attempted.join(', ') }));
      }
    }
```

Confirm `QUOTE_STATUS` and `apiValidationError` are already imported in this file; add them if not. Confirm the request body variable is named `body` — if the file uses a different name, use that.

- [ ] **Step 3: Add the message key to both locales**

In `messages/ar/api.json`, inside the existing `quotes` object:

```json
"signedContentLocked": "لا يمكن تعديل عرض سعر موقّع. الحقول المرفوضة: {fields}"
```

In `messages/en/api.json`, inside the same object:

```json
"signedContentLocked": "A signed quote cannot be edited. Rejected fields: {fields}"
```

- [ ] **Step 4: Verify the guard against production data**

Find a signed quote: `pnpm db:query "SELECT id, status FROM pyra_quotes WHERE status IN ('signed','invoiced') LIMIT 1"`

With the dev server running (`pnpm dev`), from a logged-in browser session, PATCH that quote with `{"total": 999}` and confirm HTTP 422 with the new message.

Then confirm nothing changed:
`pnpm db:query "SELECT total FROM pyra_quotes WHERE id='<that id>'"` — unchanged.

Then confirm a draft quote still accepts a PATCH.

- [ ] **Step 5: Gate and commit**

```bash
pnpm run check
git add "app/api/quotes/[id]/route.ts" messages/ar/api.json messages/en/api.json
git commit -m "fix(quotes): refuse content edits on signed and invoiced quotes

PATCH accepted items, totals, currency and expiry on a signed quote and wrote
them straight through, leaving signature_data and signed_at attached to content
that no longer existed. A signature obtained through the new public link would
have been worthless without this.

Status-only transitions are untouched, so signed -> invoiced still works.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Extract the shared sign core

**Files:**
- Create: `lib/quotes/sign-quote.ts`
- Modify: `app/api/portal/quotes/[id]/sign/route.ts`

**Interfaces:**
- Consumes: `canSignQuote` (Task 1), `toPublicQuotePayload` (Task 1).
- Produces:
  ```ts
  signQuote(supabase, {
    quoteId: string;
    signatureData: string;
    signedBy: string;
    signedIp: string | null;
    userAgent: string | null;
    source: 'portal' | 'public_link' | 'offline';
    linkId?: string | null;
  }): Promise<{ ok: true; quote: SignedQuoteRow } | { ok: false; reason: SignBlockReason | 'race' | 'db_error' }>
  ```
  Task 6 calls this.

- [ ] **Step 1: Read the portal sign route completely**

Run: `cat "app/api/portal/quotes/[id]/sign/route.ts"`
Expected: you can list every column it writes, the exact conditional-update shape (`.eq('id', id).in('status', [...])`), the 500 KB signature cap constant, and every notification/email it fires. The extraction must preserve all of it byte-for-byte in behaviour.

- [ ] **Step 2: Write the core**

Create `lib/quotes/sign-quote.ts`. Reproduce the portal route's guards and writes exactly, adding only the new columns:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { canSignQuote, type SignBlockReason } from './signability';
import { toPublicQuotePayload } from './public-payload';

/** Matches the portal route's existing cap — the public endpoint is the one
 *  that actually needs it, since anyone with the link can POST. */
export const MAX_SIGNATURE_LENGTH = 500_000;

export type SignFailure = SignBlockReason | 'race' | 'db_error' | 'signature_too_large';

export interface SignQuoteInput {
  quoteId: string;
  signatureData: string;
  signedBy: string;
  signedIp: string | null;
  userAgent: string | null;
  source: 'portal' | 'public_link' | 'offline';
  linkId?: string | null;
  /** Dubai day key — pass dubaiDayKey() from the caller. */
  todayKey: string;
}

/**
 * The one place a quote becomes signed.
 *
 * Race safety is the conditional `.in('status', [sent, viewed])`: two concurrent
 * submits both pass the read guard, and exactly one wins the UPDATE. The loser
 * gets `race`, which callers render as the friendly already-signed state rather
 * than an error.
 *
 * signed_snapshot freezes what the signature attests to, so a later edit cannot
 * silently change what the customer agreed to.
 */
export async function signQuote(
  supabase: SupabaseClient,
  input: SignQuoteInput,
): Promise<{ ok: true; quote: Record<string, unknown> } | { ok: false; reason: SignFailure }> {
  if (input.signatureData.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, reason: 'signature_too_large' };
  }

  const { data: quote, error: loadErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', input.quoteId)
    .maybeSingle();

  if (loadErr) return { ok: false, reason: 'db_error' };
  if (!quote) return { ok: false, reason: 'wrong_status' };

  const verdict = canSignQuote(
    { status: quote.status, expiry_date: quote.expiry_date },
    input.todayKey,
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const { data: items } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', input.quoteId)
    .order('sort_order', { ascending: true });

  const snapshot = toPublicQuotePayload(quote, items ?? []);
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('pyra_quotes')
    .update({
      status: QUOTE_STATUS.SIGNED,
      signature_data: input.signatureData,
      signed_by: input.signedBy,
      signed_at: now,
      signed_ip: input.signedIp,
      signed_user_agent: input.userAgent,
      signature_source: input.source,
      signed_link_id: input.linkId ?? null,
      signed_snapshot: snapshot,
      updated_at: now,
    })
    .eq('id', input.quoteId)
    .in('status', [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED])
    .select('*')
    .maybeSingle();

  if (updErr) return { ok: false, reason: 'db_error' };
  if (!updated) return { ok: false, reason: 'race' };
  return { ok: true, quote: updated };
}
```

- [ ] **Step 3: Refactor the portal route to call it**

Replace the portal route's inline guard + update with a `signQuote(...)` call using `source: 'portal'`. **Keep unchanged:** the portal auth gate, the email to `created_by`, the two `notify()` calls, and every activity row. Map failures to the same HTTP statuses and messages the route returns today — this task must be invisible to a portal user.

- [ ] **Step 4: Verify the portal path still works**

With `pnpm dev` running, log into the portal as a client with a `sent` quote and sign it. Confirm: status becomes `signed`, `signature_source` is `portal`, `signed_snapshot` is populated, and the internal bell notification still arrives.

Run: `pnpm db:query "SELECT status, signature_source, signed_snapshot IS NOT NULL AS has_snapshot FROM pyra_quotes WHERE id='<that quote>'"`
Expected: `signed | portal | true`.

- [ ] **Step 5: Gate and commit**

```bash
pnpm test && pnpm run check
git add lib/quotes/sign-quote.ts "app/api/portal/quotes/[id]/sign/route.ts"
git commit -m "refactor(quotes): one shared core for signing

The public sign endpoint must enforce exactly what the portal enforces. Two
copies of a race-safe conditional update and an expiry guard would drift, and
the sign path has no route-level tests to catch it.

Portal behaviour is unchanged: same guards, same 500KB cap, same notifications.
New columns (signature_source, signed_snapshot, signed_user_agent) are now
populated for portal signatures too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Middleware + the public read path

**Files:**
- Modify: `middleware.ts` (one inserted line, plus the comment)
- Move: `components/portal/quotes/QuoteDetailView.tsx` → `components/quotes/QuoteDetailView.tsx`
- Create: `app/d/[token]/page.tsx`, `app/d/[token]/public-quote-view.tsx`
- Create: `messages/ar/publicdoc.json`, `messages/en/publicdoc.json`
- Modify: `lib/i18n/messages.ts`, `i18n/global.ts`, `app/portal/(main)/quotes/page.tsx` (import path)

**Interfaces:**
- Consumes: `classifyLinkState`, `toPublicQuotePayload`, `quoteContentHash`, `canSignQuote` (Task 1); `pyra_document_links` (Task 2).
- Produces: `/d/<token>` rendering. Task 6 adds the POST it calls.

- [ ] **Step 1: Read the middleware and confirm the exact current text**

Run: `sed -n '50,80p;95,170p' middleware.ts`
Expected: you can see `publicRoutes`, the CSRF block, and the API gate chain. Confirm the API chain matches the spec's quoted version. If it has drifted, adapt the insertion point but keep the rule: the new line goes in the **API gate chain only**.

- [ ] **Step 2: Insert the one line**

In the API gate chain, after the `/api/shares/download` line, insert:

```ts
    !pathname.startsWith('/api/public') &&
```

Extend the comment block above the chain with:

```
 *  - /api/public/*  — authenticated by opaque document-link token, not by
 *    session. The route's own token + rate-limit gate is the canonical check.
```

**Do not** add anything to `publicRoutes`, the CSRF exempt list, or `config.matcher`.

- [ ] **Step 3: Prove `/dashboard` is still protected**

With `pnpm dev` running:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/d/nonexistenttoken
```
Expected: `307` for `/dashboard` (redirect to login), `404` for `/d/...` (the page renders and returns not-found — it is not redirected).

If `/dashboard` returns anything other than 307, you added `/d` to `publicRoutes`. Revert that.

- [ ] **Step 4: Move QuoteDetailView and fix its importer**

```bash
git mv components/portal/quotes/QuoteDetailView.tsx components/quotes/QuoteDetailView.tsx
grep -rn "portal/quotes/QuoteDetailView" app components hooks
```
Update every hit (the spec cites `app/portal/(main)/quotes/page.tsx`) to `@/components/quotes/QuoteDetailView`.

- [ ] **Step 5: Confirm the gate now fails, then translate**

Run: `pnpm run check`
Expected: **FAIL** — `i18n-check` now reports the ~19 hardcoded Arabic strings, because `components/quotes` is in `MIGRATED_PATHS`. This failure is the point: the file was invisible to the gate inside `components/portal/`.

Extract each string into the existing quotes namespace (find it with `ls messages/ar/`), add the English counterpart, and replace with `useTranslations`. Re-run until clean.

- [ ] **Step 6: Add the public-document namespace**

Create `messages/ar/publicdoc.json`:

```json
{
  "publicdoc": {
    "invalidTitle": "الرابط غير صالح",
    "invalidBody": "الرابط ده منتهي أو اتلغى. اطلب من مندوب المبيعات رابط جديد.",
    "quoteExpiredTitle": "انتهت صلاحية عرض السعر",
    "quoteExpiredBody": "عرض السعر ده انتهت مدته. اطلب عرض محدّث.",
    "alreadySignedTitle": "تم التوقيع",
    "alreadySignedBody": "عرض السعر ده موقّع بالفعل بتاريخ {date}.",
    "changedTitle": "العرض اتغيّر",
    "changedBody": "تفاصيل العرض اتعدلت بعد ما الرابط اتبعت. اطلب رابط جديد.",
    "unavailableTitle": "غير متاح",
    "unavailableBody": "عرض السعر ده مش متاح للعرض حالياً.",
    "signError": "حصل خطأ أثناء حفظ التوقيع. حاول تاني.",
    "rateLimited": "محاولات كتير. استنى شوية وحاول تاني."
  }
}
```

Create `messages/en/publicdoc.json` with the same keys in English.

Register the namespace in `lib/i18n/messages.ts` (`NAMESPACE_FILES`) and `i18n/global.ts`, following exactly how an existing namespace is registered there.

- [ ] **Step 7: Write the server component**

Create `app/d/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyLinkState } from '@/lib/documents/link-state';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { canSignQuote } from '@/lib/quotes/signability';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { PublicQuoteView } from './public-quote-view';

// Never cached: link state and quote status both change server-side.
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: link, error: linkErr } = await supabase
    .from('pyra_document_links')
    .select('id, entity_type, entity_id, content_hash, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  // A DB error must NOT render as "invalid link" — that is exactly how the
  // /api/shares stack stayed dead in production for five months.
  if (linkErr) throw new Error(`document link lookup failed: ${linkErr.message}`);

  // Unknown, revoked and expired all collapse into one indistinguishable
  // response so a harvested token cannot be confirmed as once-real (S-10).
  if (!link || link.entity_type !== 'quote') notFound();
  if (classifyLinkState(link, new Date().toISOString()) !== 'valid') notFound();

  const { data: quote, error: quoteErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', link.entity_id)
    .maybeSingle();
  if (quoteErr) throw new Error(`quote lookup failed: ${quoteErr.message}`);
  if (!quote) notFound();

  // Draft and pending_approval must never be reachable publicly (S-19).
  const VISIBLE: readonly string[] = [
    QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED, QUOTE_STATUS.SIGNED, QUOTE_STATUS.INVOICED,
  ];
  if (!VISIBLE.includes(quote.status)) notFound();

  const { data: items } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', quote.id)
    .order('sort_order', { ascending: true });

  const payload = toPublicQuotePayload(quote, items ?? []);
  const contentChanged =
    !!link.content_hash && link.content_hash !== quoteContentHash(payload);

  // Recipient-language rendering: an anonymous visitor has no pyra_locale
  // cookie, so without this a customer who reads English gets an Arabic legal
  // document. Resolve from the client's stored preference.
  let locale = 'ar';
  if (quote.client_id) {
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('preferred_language')
      .eq('id', quote.client_id)
      .maybeSingle();
    if (client?.preferred_language === 'en') locale = 'en';
  }
  const t = await getTranslations({ locale, namespace: 'publicdoc' });

  await supabase.rpc('pyra_increment_document_link_view', { link_id: link.id });

  // sent -> viewed on first open, mirroring the portal.
  if (quote.status === QUOTE_STATUS.SENT) {
    await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.VIEWED, viewed_at: new Date().toISOString() })
      .eq('id', quote.id)
      .eq('status', QUOTE_STATUS.SENT);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const signable = canSignQuote(
    { status: quote.status, expiry_date: quote.expiry_date },
    todayKey,
  );

  return (
    <PublicQuoteView
      token={token}
      quote={payload}
      locale={locale}
      canSign={signable.ok && !contentChanged}
      blockReason={contentChanged ? 'content_changed' : signable.ok ? null : signable.reason}
      copy={{
        alreadySignedTitle: t('alreadySignedTitle'),
        alreadySignedBody: t('alreadySignedBody', { date: String(quote.signed_at ?? '') }),
        quoteExpiredTitle: t('quoteExpiredTitle'),
        quoteExpiredBody: t('quoteExpiredBody'),
        changedTitle: t('changedTitle'),
        changedBody: t('changedBody'),
        unavailableTitle: t('unavailableTitle'),
        unavailableBody: t('unavailableBody'),
        signError: t('signError'),
        rateLimited: t('rateLimited'),
      }}
    />
  );
}
```

Note: `todayKey` above is UTC. Replace `new Date().toISOString().slice(0, 10)` with the real `dubaiDayKey()` import you confirmed in Task 1 Step 1.

- [ ] **Step 8: Write the client wrapper**

Create `app/d/[token]/public-quote-view.tsx` (`'use client'`). It renders `QuoteDetailView` with `onBack` as a no-op (there is nowhere to go back to on a public page), `onDownload` calling the public PDF route, and `onSign` POSTing to `/api/public/quotes/${token}/sign`. It owns `signing` state, handles HTTP 429 by showing `copy.rateLimited`, and on `already signed` re-renders read-only rather than showing an error.

Handle the envelope divergence explicitly: `checkRateLimit` returns `{ success, error }` while `apiSuccess` returns `{ data, error, meta }`. Branch on `res.status === 429` before parsing.

- [ ] **Step 9: Set the response headers**

Add to `app/d/[token]/page.tsx` — or `app/d/[token]/layout.tsx` if headers are easier there — `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex, nofollow`. Verify with `curl -I http://localhost:3000/d/<token>`.

- [ ] **Step 10: Create a real link row and test anonymously**

Insert a test link for an existing `sent` quote:
```bash
pnpm db:query "INSERT INTO pyra_document_links (id, entity_type, entity_id, token, created_by) SELECT 'dl_test1', 'quote', id, 'testtoken1234567890testtoken1234567890test', 'elharm' FROM pyra_quotes WHERE status='sent' LIMIT 1"
```

Then, **in an incognito window with no cookies**, open `http://localhost:3000/d/testtoken1234567890testtoken1234567890test`.
Expected: the quote renders. Confirm `view_count` incremented and the status flipped to `viewed`:
```bash
pnpm db:query "SELECT view_count, last_viewed_at FROM pyra_document_links WHERE id='dl_test1'"
```

- [ ] **Step 11: Confirm invalid states are indistinguishable**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/d/completelyrandomtoken
pnpm db:query "UPDATE pyra_document_links SET revoked_at = now() WHERE id='dl_test1'"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/d/testtoken1234567890testtoken1234567890test
```
Expected: identical status codes. Then restore: `pnpm db:query "UPDATE pyra_document_links SET revoked_at = NULL WHERE id='dl_test1'"`

- [ ] **Step 12: Gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add middleware.ts app/d components/quotes/QuoteDetailView.tsx messages lib/i18n i18n "app/portal/(main)/quotes/page.tsx"
git commit -m "feat(quotes): public quote page at /d/<token>

Read path is a Server Component querying with the service role — no API route,
which structurally avoids the 401 and envelope bugs that have kept
/api/shares/* dead since it shipped.

Unknown, revoked and expired tokens return one indistinguishable response so a
harvested token cannot be confirmed as once-real. A DB error throws instead of
rendering as 'invalid link' — that masquerade is why the share stack's breakage
went unnoticed for five months.

QuoteDetailView moved out of components/portal/ and translated: it was 100%
hardcoded Arabic and invisible to the i18n gate, which would have shipped an
Arabic-only legal document to English-speaking customers.

Verified anonymously in an incognito window; /dashboard still redirects to login.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The public sign endpoint

**Files:**
- Create: `app/api/public/quotes/[token]/sign/route.ts`
- Modify: `lib/utils/rate-limit.ts` (add two limiters)

**Interfaces:**
- Consumes: `signQuote` (Task 4), `classifyLinkState` (Task 1), `quoteContentHash` (Task 1).
- Produces: `POST /api/public/quotes/[token]/sign` → `{ data: { signed: true } }` or a mapped error.

- [ ] **Step 1: Read the existing rate limiter**

Run: `sed -n '1,60p' lib/utils/rate-limit.ts`
Expected: you can see the module-level Map store and `checkRateLimit`'s return shape. Note that the store is per-process and resets on restart — document this in the route, it is not a security control.

- [ ] **Step 2: Add two dedicated limiters**

Following the existing limiter definitions in that file, add `documentLinkViewLimiter` and `documentLinkSignLimiter`. Keep them separate from `shareDownloadLimiter` so exhausting one cannot affect the other.

- [ ] **Step 3: Write the route**

Create `app/api/public/quotes/[token]/sign/route.ts`. It must:
- Take the client IP the same way the rest of the app does — `grep -rn "x-forwarded-for" app/api | head -3` and copy that exact expression.
- Apply `documentLinkSignLimiter`; return 429 before any DB work.
- Load the link by token via `createServiceRoleClient()`; `classifyLinkState` must be `valid`.
- Re-verify `content_hash` against the freshly computed hash and refuse if changed.
- Call `signQuote(...)` with `source: 'public_link'` and `linkId: link.id`.
- Map `race` → a 200 with an already-signed marker (not an error), every other failure → 422.
- Write `pyra_activity_log` with `username: 'public_link'` and `display_name: <typed signer name>` — both columns are NOT NULL and a public signer has neither.
- Fire `notify()` to the quote's `created_by`, and email the signer their signed copy (owner decision D-3).
- On DB error: `logError()` + 500, never the invalid-link response.

- [ ] **Step 4: Sign anonymously, end to end**

In the same incognito window from Task 5, sign the test quote. Then verify:
```bash
pnpm db:query "SELECT status, signature_source, signed_by, signed_link_id, signed_ip IS NOT NULL AS has_ip, signed_snapshot IS NOT NULL AS has_snapshot FROM pyra_quotes WHERE id=(SELECT entity_id FROM pyra_document_links WHERE id='dl_test1')"
```
Expected: `signed | public_link | <typed name> | dl_test1 | true | true`.

- [ ] **Step 5: Prove the double-submit race is safe**

Reset the quote to `sent`, then fire two concurrent signs:
```bash
for i in 1 2; do curl -s -X POST http://localhost:3000/api/public/quotes/<token>/sign \
  -H "Content-Type: application/json" \
  -d '{"signature_data":"data:image/png;base64,AAA","signed_by":"Race Test"}' & done; wait
```
Expected: exactly one records a new signature; the other returns the already-signed path. Confirm exactly one `pyra_activity_log` row was written for the signing.

- [ ] **Step 6: Gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add "app/api/public/quotes/[token]/sign/route.ts" lib/utils/rate-limit.ts
git commit -m "feat(quotes): public sign endpoint

Signing goes through the shared core so the public path enforces exactly what
the portal enforces, including the race-safe conditional update: two concurrent
submits produce one signature and one friendly already-signed response.

The activity row uses username 'public_link' because that column is NOT NULL
and an anonymous signer has no username; the typed name goes in display_name.

Rate limiting is per-process and resets on restart — documented in the route as
an abuse speed bump, not a security control. The durable counter is view_count,
bumped through a SECURITY DEFINER RPC.

Verified anonymously end to end, including the concurrent double-submit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Link management UI

**Files:**
- Create: `app/api/quotes/[id]/link/route.ts`, `hooks/useDocumentLinks.ts`, `components/quotes/PublicLinkDialog.tsx`
- Modify: `app/dashboard/quotes/quotes-client.tsx`, `app/api/quotes/[id]/route.ts` (auto-revoke), `messages/{ar,en}/*.json`

**Interfaces:**
- Consumes: `generateDocumentLinkToken`, `quoteContentHash`, `toPublicQuotePayload` (Task 1).
- Produces: `POST/GET/DELETE /api/quotes/[id]/link`; `useQuoteLink(quoteId)`, `useCreateQuoteLink()`, `useRevokeQuoteLink()`.

- [ ] **Step 1: Write the API route**

`POST` mints a link — gated `quotes.edit`, refused unless `status ∈ {sent, viewed}` with a clear message ("send the quote first"), computes and stores `content_hash`, sets `expires_at` from the quote's `expiry_date`. The unique partial index makes "one live link" a DB guarantee; handle `23505` by returning the existing live link instead of erroring.

`GET` returns the live link **without the token** except immediately after creation — the token is returned once, by `POST`, and never in a list (S-5).

`DELETE` sets `revoked_at` + `revoked_by`.

- [ ] **Step 2: Auto-revoke on quote edit**

In `app/api/quotes/[id]/route.ts` PATCH, after a successful content update, revoke any live link for that quote. A link minted for one price must not keep working after the price changes. Task 3's guard already blocks this for signed quotes; this covers `sent`/`viewed`.

- [ ] **Step 3: Hooks and dialog**

`hooks/useDocumentLinks.ts` using `fetchAPI`/`mutateAPI` — no raw fetch. `PublicLinkDialog` shows the URL with a copy button, view count, last-viewed time, and a revoke action. All strings via `useTranslations`; both locales.

- [ ] **Step 4: Wire the row dropdown**

Add «رابط التوقيع» to the dropdown in `quotes-client.tsx:257-300`, visible only for `sent`/`viewed` and only with `quotes.edit`.

- [ ] **Step 5: Verify the full loop**

Mint a link from the UI → open it in incognito (renders) → edit the quote's total from the dashboard → reload the link → expect the invalid-link state. Confirm `revoked_at IS NOT NULL`.

- [ ] **Step 6: Gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add "app/api/quotes/[id]/link" hooks/useDocumentLinks.ts components/quotes/PublicLinkDialog.tsx app/dashboard/quotes/quotes-client.tsx "app/api/quotes/[id]/route.ts" messages
git commit -m "feat(quotes): mint, share and revoke the public signing link

One live link per quote is enforced by a partial unique index rather than by
application logic, so 'the link' is unambiguous for sales and revoke-on-edit is
trivially correct.

Editing a quote revokes its live link: a link minted for one price must not
keep working after the price changes.

The token is returned exactly once, by the create call, and never appears in a
list response.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Offline signature attestation

**Files:**
- Create: `app/api/quotes/[id]/offline-signature/route.ts`, `app/api/quotes/[id]/offline-signature/evidence/route.ts`, `components/quotes/OfflineSignDialog.tsx`, `hooks/useOfflineSignature.ts`
- Modify: `app/dashboard/quotes/quotes-client.tsx`, `messages/{ar,en}/*.json`

**Interfaces:**
- Consumes: `validateEvidenceFile`, `isPdfMagic` (Task 1).
- Produces: `POST /api/quotes/[id]/offline-signature` (multipart), `GET .../evidence` (signed URL).

- [ ] **Step 1: Read the HR document upload as the pattern**

Run: `sed -n '1,140p' app/api/hr/documents/route.ts`
Expected: you can see the FormData handling, the `pyra-private` upload path convention, the signed-URL issuance, and the `const { storage_path, ...rest } = row;` strip at `:117-123`. Copy the shape; **do not** copy the 20 MB cap — the bucket limit is 10 MiB.

- [ ] **Step 2: Write the upload route**

Gated `quotes.edit`. Reads the file from FormData, runs `validateEvidenceFile`, reads the first 8 bytes and runs `isPdfMagic` when the MIME is `application/pdf`, uploads to `pyra-private` with an extension from `MIME_TO_EXT`, then updates the quote:

```ts
      status: QUOTE_STATUS.SIGNED,
      signature_source: 'offline',
      signed_by: signerName,
      signed_at: signedDate,                       // typed by the admin
      signed_offline_by: auth.pyraUser.username,   // NEVER from the body (S-26)
      signed_offline_at: new Date().toISOString(),
      signed_evidence_path: path,
      signed_evidence_mime: file.type,
      signed_evidence_size: file.size,
```

On DB failure, `void supabase.storage.remove([path])` so a failed attestation does not orphan a file.

- [ ] **Step 3: Write the evidence read route**

Returns a short-TTL signed URL only. `signed_evidence_path` must never appear in any response body.

- [ ] **Step 4: Dialog + hook**

`OfflineSignDialog` collects the PDF and the signature date. The upload hook uses **raw fetch** (the sanctioned FormData exemption); sibling mutations use `mutateAPI`. Add the dropdown action, gated `quotes.edit`, hidden for already-signed quotes.

- [ ] **Step 5: Verify every guard**

- Upload a real counter-signed PDF → succeeds; `signed_offline_by` equals your session username.
- POST with `signed_offline_by: "someone.else"` in the body → the stored value is still your username.
- Upload an 11 MB file → rejected by the app with a clear message, not by Supabase with a generic one.
- Rename a `.svg` to `.pdf` and upload → rejected by the magic-byte check.
- `grep -rn "signed_evidence_path" app/api/quotes` → confirm it is never selected into a response.

- [ ] **Step 6: Gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add "app/api/quotes/[id]/offline-signature" components/quotes/OfflineSignDialog.tsx hooks/useOfflineSignature.ts app/dashboard/quotes/quotes-client.tsx messages
git commit -m "feat(quotes): record a signature obtained outside the system

When the customer signs the PDF we emailed or handed over, the counter-signed
file is the evidence and it now lives in the private bucket with the quote,
served only through a short-TTL signed URL.

The attesting internal user is derived from the session and cannot be set from
the request body — the whole point of the record is that it names who vouched
for the signature.

PDFs are verified by magic bytes, not by the client-supplied MIME type. No
existing upload route in this repo does content sniffing; for legal evidence it
is worth the extra read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Honest delivery status

**Files:**
- Modify: `app/api/quotes/[id]/send/route.ts`, `app/dashboard/quotes/quotes-client.tsx`, `messages/{ar,en}/*.json`

**Interfaces:**
- Consumes: `deriveDelivery` (Task 1); the `delivery_*` columns (Task 2).

- [ ] **Step 1: Persist the outcome**

In the send route, after the email attempt resolves, call `deriveDelivery(email)` and write `delivery_status`, `delivery_detail`, `delivery_checked_at` onto the quote. Do **not** change the existing status flip to `sent` — that ordering is deliberate and documented in the route; what changes is that the list stops lying about the outcome.

- [ ] **Step 2: Badge the list**

In `quotes-client.tsx`, render a badge next to the status when `delivery_status` is `no_email` or `not_delivered`, with a tooltip naming the reason and pointing at WhatsApp as the alternative. Both locales. RTL classes only, paired `dark:` variants.

- [ ] **Step 3: Verify all three outcomes**

- Send to a client with no email → `no_email` persisted and badged.
- Temporarily break SMTP (e.g. point the host at an unreachable value in `.env.local`) → `not_delivered`. Restore afterwards.
- Send successfully → `delivered`, no badge.

Confirm the toast and the badge agree in all three cases.

- [ ] **Step 4: Gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add "app/api/quotes/[id]/send/route.ts" app/dashboard/quotes/quotes-client.tsx messages
git commit -m "feat(quotes): show whether a quote was actually delivered

The send route already computed an honest email outcome and threw it away, so
the list showed 'sent' for mail that never left — on a mail server whose
certificate expired eight weeks ago and whose validation was switched off
rather than renewed.

The quote still flips to sent regardless; that ordering is deliberate. What
changes is that a failed delivery is now visible, so sending it on WhatsApp
becomes an obvious next action instead of a guess.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Docs, manifest and locked decisions

**Files:**
- Modify: `scripts/i18n-check.ts`, `DATABASE-SCHEMA.md`, `CLAUDE.md`, `docs/decisions/finance.md`

- [ ] **Step 1: Extend the i18n manifest**

Append `'app/d'` and `'app/api/public'` to `MIGRATED_PATHS` in `scripts/i18n-check.ts`.

- [ ] **Step 2: Document the schema**

Add `pyra_document_links` to `DATABASE-SCHEMA.md` with all 12 columns, the three indexes, and a note that it is service-role-only. Add the 12 new `pyra_quotes` columns.

- [ ] **Step 3: Record the locked decisions**

Add a section to `docs/decisions/finance.md` capturing D-1 (no bank details on the public PDF), D-2 (append-only signature trigger as partial Gap #3 mitigation), D-3 (signer gets a copy), D-4 (QuoteDetailView moved and translated), plus the S-10 indistinguishable-response rule and the S-11 never-mask-a-DB-error rule. Add **one** index line in `CLAUDE.md` pointing at it — never paste the narrative into `CLAUDE.md`.

- [ ] **Step 4: Update the architecture map**

Add the new routes and libs to the `CLAUDE.md` architecture block, in the existing style.

- [ ] **Step 5: Final gate and commit**

```bash
pnpm test && pnpm run check && pnpm build
git add scripts/i18n-check.ts DATABASE-SCHEMA.md CLAUDE.md docs/decisions/finance.md
git commit -m "docs(quotes): record public signing decisions and schema

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final acceptance — paste the output into the PR

From a **cookie-less** client (incognito or curl), against the deployed build:

1. `GET /d/<valid-token>` renders the quote.
2. `POST /api/public/quotes/<token>/sign` succeeds and the quote reads `signature_source = 'public_link'`.
3. `GET /dashboard` still returns 307 to `/login`.
4. A random token and a revoked token return byte-identical responses.
5. `pnpm db:check-drift` shows exactly one MISSING (036) — the pre-existing baseline.

Every previous public-link feature in this repo shipped broken and stayed broken because it was only ever tested from a logged-in tab. This checklist is the whole point.

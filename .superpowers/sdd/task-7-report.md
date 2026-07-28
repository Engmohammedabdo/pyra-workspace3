# Task 7 Report — Link management UI

> Note: this file previously contained the report for an unrelated Employee
> Offboarding "Task 7" (`lib/hr/handover.ts`) — overwritten per instructions
> with the report for the public-quote-signing Task 7 below.

**Status:** DONE
**Commit:** `1fbd7dc` — `feat(quotes): mint, share and revoke the public signing link`

## What was built

- **`app/api/quotes/[id]/link/route.ts`** — `GET`/`POST`/`DELETE`, gated
  `requireApiPermission('quotes.edit')` + the same three-way scope check GET/PATCH/DELETE
  `/api/quotes/[id]` already use (own quote OR lead-owned OR client-in-scope), replicated
  locally as `canAccessQuoteForLink()` (no shared helper existed to import).
- **`hooks/useDocumentLinks.ts`** — `useQuoteLink(quoteId)`, `useCreateQuoteLink()`,
  `useRevokeQuoteLink()`, all via `fetchAPI`/`mutateAPI`. `QuoteLinkInfo` (GET shape, no
  token) vs `QuoteLinkCreated` (POST shape, `token`/`url` present — `null` only on the
  race-loss branch, see below).
- **`components/quotes/PublicLinkDialog.tsx`** — mint/copy/inspect/revoke dialog. Local
  `mintedUrl` state (reset on `quoteId` change) is the ONLY place a token is ever held
  client-side after the create call resolves; re-opening the dialog later shows metadata
  (view count, last-viewed, expiry) with no copyable URL, by design.
- **`app/dashboard/quotes/quotes-client.tsx`** — new dropdown item «رابط التوقيع» (Task 7
  brief's exact label), gated `canEdit && status ∈ {sent, viewed}`, opens the dialog via
  `linkQuoteId` state (mirrors the existing `selected`/`showDelete` pattern in the same
  file).
- **`app/api/quotes/[id]/route.ts` PATCH** — auto-revoke block added right after a
  successful content update.
- **`messages/{ar,en}/api.json`** — `api.quotes.linkRequiresSent`, `api.quotes.linkNotFound`.
- **`messages/{ar,en}/finance.json`** — `finance.quotes.list.rowActions.publicLink` +
  a new `finance.quotes.publicLink` block (28 keys), symmetric AR/EN key sets.

## The one-live-link constraint (`idx_document_links_one_live`)

Handled with **revoke-then-insert**, never a bare insert, exactly as flagged:

```
UPDATE pyra_document_links SET revoked_at=now(), revoked_by=<actor>
  WHERE entity_type='quote' AND entity_id=$id AND revoked_at IS NULL;
INSERT INTO pyra_document_links (...) VALUES (...);
```

The revoke step runs unconditionally before every insert, so it also revokes an
**expired-but-unrevoked** link (the index doesn't distinguish "expired" from "live" —
only `revoked_at IS NULL` matters), which is exactly the trap described in the brief.
Verified live: minting twice in a row on the same `sent` quote returned `200` both
times, with two different `id`/`token` pairs, and the DB shows the first row's
`revoked_at` set ~4s later by the second mint (see evidence below).

**23505 catch (genuine concurrent race, not the sequential case above):** if two POSTs
truly overlap — both revoke (no-op), both attempt insert, one wins — the loser catches
`23505`, re-queries the now-live row, and returns its metadata with `token: null,
url: null`. It does **not** fabricate or borrow the winner's token — S-5 ("token
returned exactly once, by the request that minted it") holds even in the loss branch.
This path was not exercised live (would need true network-level concurrency to trigger
reliably) but is covered by the revoke-then-insert code path being correct by
construction: the only way `insertErr.code === '23505'` fires is `idx_document_links_one_live`,
since `id` is a fresh nanoid and `token` a fresh 256-bit value (both effectively unique).

## `content_hash`

Computed as `quoteContentHash(toPublicQuotePayload(quote, items))` and stored on every
`POST` insert. Verified via direct DB read: both live-tested link rows have
`content_hash IS NOT NULL`. This is the first code in the repo that ever writes this
column — before this task the guard in `app/d/[token]/page.tsx` and the sign route
(`!!link.content_hash && ...`) always short-circuited to `false` and never fired.

**Confirmed the guard now actually matters in practice — but via the stronger path.**
Editing the quote's `notes` field (a `CONTENT_KEYS` field) after minting a link
triggered the PATCH auto-revoke (Step 2 below), which sets `revoked_at` — so
`classifyLinkState()` reports `'revoked'` and the public page 404s via `notFound()`
*before* it ever reaches the `content_hash` comparison. The soft content-hash-mismatch
UI (`blockReason: 'content_changed'`, still a `200` with a "the offer changed" banner)
is now reachable only for `entity_type` values that don't yet have an auto-revoke-on-edit
wired (none exist yet — quote is the only public-link entity type live) or in the
narrow window between a content edit racing an in-flight public GET. The column is no
longer permanently `NULL`, so the guard is live infrastructure now, not dead code.

## Auto-revoke on quote edit (Step 2)

`CONTENT_KEYS.filter((k) => k in body)` was hoisted out of the `LOCKED_STATUSES` branch
(computed once, used twice) so the same presence check drives both: (a) the existing
signed/invoiced hard-block, and (b) a new post-update step that revokes any live link
for the quote whenever a `CONTENT_KEYS` field was present in the PATCH body —
presence-based, not value-diff-based, matching the existing convention in that same
file. `revoked_by` is the editing user's username (not `'system'`) since a real actor
triggered it. `logActivity('quote_link_revoked', ..., { trigger: 'content_edit' })`
fires alongside the pre-existing `quote_updated` log — same action-type string the
manual-revoke `DELETE` endpoint uses, distinguished by `details.trigger`.

## `documentLinkViewLimiter` — left as dead code

Per the brief's own framing ("if not, say so and leave it"): wiring it into
`app/d/[token]/page.tsx` was NOT done. That page is a Server Component with no
`Request` object (only `params`), so wiring it would mean pulling client IP from
`next/headers` — a change to a file outside this task's file list (`app/api/quotes/[id]/link`,
`hooks/useDocumentLinks.ts`, `components/quotes/PublicLinkDialog.tsx`,
`quotes-client.tsx`, `app/api/quotes/[id]/route.ts`, `messages`) and outside Task 7's
stated scope (link *management*, not view-path rate limiting). Left untouched.

## Verification (live, against production Supabase — no local DB)

Dev server was killed and restarted fresh after all route files existed (per the
stale-server warning). A disposable e2e admin account (`e2e.t7`, mirroring
`lib/hr/create-employee.ts`'s exact user-creation steps: `auth.admin.createUser` →
`pyra_users` insert → `pyra_auth_mapping` insert) was created via a throwaway script,
used to log in via `POST /api/auth/login` and capture a real session cookie, then
deleted afterward — same disposable-account pattern the project already uses for the
call-tracking `e2e.upgrade` account. Two throwaway quotes were seeded directly via the
service-role client: `qt_t7_clherfyo` (`status='sent'`) and `qt_t7_qjz4zjoa`
(`status='draft'`). `qt_ca8CD32kV1HMpqZw` (the real `sent` customer quote) was never
read or written by any step below.

| # | Check | Result |
|---|---|---|
| 1 | `POST` mint on the `sent` quote | `200`, `token`+`url` present, `expires_at: "2026-08-04T20:00:00+00:00"` (quote's `expiry_date` 2026-08-04, Dubai-day-boundary math correct — 20:00 UTC = Dubai midnight of the next day) |
| 2 | `GET` immediately after — **no token in the response** | `200`, body `{"exists":true,"id":...,"expires_at":...,"created_at":...,"view_count":0,"last_viewed_at":null}` — no `token`/`url` keys at all |
| 3 | `POST` mint on the `draft` quote | `422`, `"يجب إرسال عرض السعر للعميل أولاً قبل إنشاء رابط التوقيع"` (send-first message) |
| 4 | `POST` mint **again** on the same `sent`/`viewed` quote (the 23505/expiry trap) | `200`, a **different** `id`/`token` than mint #1 — proves revoke-then-insert, not a bare insert |
| 5 | Anonymous `GET /d/<token2>` (cookie-less curl) | `200`, page HTML contains the quote number `T7-VERIFY-...` — renders correctly |
| 6 | Anonymous `GET /d/<token1>` (revoked by mint #4) | `404` — not-found page |
| 7 | `PATCH /api/quotes/<id>` with `notes` (a `CONTENT_KEYS` field), authenticated | `200`, quote updated |
| 8 | Anonymous `GET /d/<token2>` reloaded after the edit | `404` — now invalid (auto-revoke fired) |
| 9 | DB: `pyra_document_links` rows for the quote | both rows `revoked_at IS NOT NULL`; row 2's `revoked_at` (`05:40:13.791`) matches the PATCH timestamp (`updated_at: 05:40:13.663`) to the second; row 1's `revoked_at` (`05:39:20.377`) is ~4s after its own `created_at` (`05:39:16.871`), matching mint #4's revoke-then-insert step; both rows `has_content_hash: true`; `revoked_by: "e2e.t7"` on both |
| 10 | `GET` link when none is live | `200`, `{"exists":false}` |
| 11 | `DELETE` when none is live | `404`, `"لا يوجد رابط نشط لهذا العرض"` |
| 12 | Mint a 3rd link, then `DELETE` (manual revoke) | mint `200` with token; delete `200`, `{"revoked":true}` |
| 13 | `POST` mint, no auth cookie | `401` |
| 14 | `POST` mint on a nonexistent quote id | `404`, `"عرض السعر غير موجود"` |

**Cleanup:** all `qt_t7_*` quotes/items, all `pyra_document_links` rows pointing at
them, the `e2e.t7` `pyra_users`/`pyra_auth_mapping` rows, and the `e2e.t7@pyra.local`
Supabase Auth user were deleted. Post-cleanup counts (all zero):
`remainingQuotes: 0, remainingItems: 0, remainingLinks: 0, remainingUsers: 0,
remainingMappings: 0, authStillThere: false`. Confirmed `qt_ca8CD32kV1HMpqZw` untouched
(`status: "sent"`, `signed_at: null`, `updated_at` unchanged from before this session)
and total `pyra_quotes` row count back to exactly **3**.

## Gates

- `pnpm run check` (`tsc --noEmit && i18n-check`) → clean. `i18n:check ✓ clean` — every
  new string in `app/api/quotes/[id]/link`, `components/quotes/PublicLinkDialog.tsx`,
  and the dropdown addition in `quotes-client.tsx` is a catalog key with AR+EN parity
  (verified key-set equality with a script, not just "file exists").
- `pnpm test` → `840 passed`, **1 pre-existing unrelated failure** in
  `__tests__/atomic-task-write-routes.test.ts` (`pyra_create_task_atomic migration
  signature: expected undefined to be truthy`) — exactly the failure flagged as expected
  in the brief, untouched by this task.
- `pnpm build` → **not run** (known to OOM on this machine per instructions — not
  retried; reporting as environmentally blocked, not a code defect).

## Design notes / judgment calls

- **GET's "no link" shape is `{exists:false}`, not `data:null`.** `fetchAPI()` unwraps
  via `json.data ?? json`; if a route ever returned `apiSuccess(null)`, `??` would treat
  `null` as nullish and the hook would resolve to the *whole envelope object*
  (`{data:null,error:null,meta:null}`) instead of `null` — silently truthy, silently
  wrong. `{exists:false}` avoids that landmine entirely.
- **`expires_at` uses Dubai-day-boundary math, not `expiry_date + 'T23:59:59Z'`.**
  `lib/quotes/signability.ts` compares `quote.expiry_date` against `dubaiDayKey()`
  (Dubai calendar day, inclusive same-day signable). A naive UTC end-of-day would cut
  the link's validity short by up to 4 hours on the last day. Implemented as a local
  (not exported) helper in the route file with the derivation spelled out in a comment,
  rather than a new `lib/` file, to stay inside the brief's file list.
- **Revoke button lives inside the stats card, not the footer**, with a nested
  confirm `<Dialog>` — mirrors the existing `WebhookSecretInfo.tsx` "regenerate secret"
  pattern (destructive action near its context, separate confirm dialog) rather than
  inventing a new layout.
- **Scope-check duplication.** `canAccessQuoteForLink()` re-implements the same
  own/lead/client three-way check that already exists inline in three places inside
  `app/api/quotes/[id]/route.ts` (GET/PATCH/DELETE). No shared helper existed to import;
  extracting one would have touched files outside this task's list, so it's a fourth,
  file-local copy — consistent with the existing (non-DRY) pattern rather than a
  surprise refactor.

## Files touched

- `app/api/quotes/[id]/link/route.ts` (new)
- `hooks/useDocumentLinks.ts` (new)
- `components/quotes/PublicLinkDialog.tsx` (new)
- `app/dashboard/quotes/quotes-client.tsx` (modified — import, state, dropdown item, dialog mount)
- `app/api/quotes/[id]/route.ts` (modified — `attemptedContentKeys` hoist + auto-revoke block)
- `messages/ar/api.json`, `messages/en/api.json` (modified — 2 new keys under `quotes`)
- `messages/ar/finance.json`, `messages/en/finance.json` (modified — 1 new `rowActions` key + 28-key `publicLink` block)

---

## Addendum — review-fix pass (2026-07-28)

Two review findings against the code above. Both fixed on `integrate-pending-fixes`.

### Finding 1 (main): mint path could permanently kill a live link on a non-23505 insert failure

**The bug.** `POST /api/quotes/[id]/link` revokes any live link, then inserts the new
one. No transactions exist in this codebase. If the revoke succeeds and the insert then
fails for any reason OTHER than `23505` (network blip, timeout, transient DB error), the
route returned `apiServerError()` and left the old link permanently `revoked_at IS NOT
NULL` with nothing to replace it — a customer's live signing link goes dead with no
warning to anyone.

**The fix** (`app/api/quotes/[id]/link/route.ts`), mirroring the rollback convention at
`app/api/quotes/route.ts:373-374` (items-insert failure deletes the just-inserted quote
row):

1. The revoke `.update()` now chains `.select('id')`. Since the `WHERE` clause is
   `.is('revoked_at', null)`, any row it touches was — by definition — live
   (`revoked_at`/`revoked_by` both `NULL`) immediately beforehand, so there is no need to
   fetch "prior" values separately; restoring just means setting both back to `NULL`.
   `revokedLinkId` is `null` when nothing was live (the quote's first-ever mint).
2. On insert failure with `insertErr.code !== '23505'`:
   - `logError()` first, unconditionally (existing behavior kept).
   - If `revokedLinkId` is `null` (nothing to restore), return the generic
     `apiServerError()` unchanged.
   - Otherwise, `UPDATE pyra_document_links SET revoked_at = NULL, revoked_by = NULL
     WHERE id = revokedLinkId` and return `apiServerError(t('quotes.linkInsertFailedRestored'))`
     — a message that tells the caller their existing link is intact, not a generic
     failure.
   - If *that* restore update itself errors, `logError()` again (separate call, distinct
     `metadata.scope: 'quote_link_post_restore_failed'`, includes `link_id`) — this is the
     state a human must catch and fix by hand — and return
     `apiServerError(t('quotes.linkInsertFailedRestoreFailed'))`, a visibly different
     message so the caller isn't told a comforting lie.
3. The `23505` branch (genuine concurrent-mint race) is **untouched** — it still returns
   before reaching any of the above, so it never un-revokes the row the winner already
   superseded.

New catalog keys (`quotes.linkInsertFailedRestored`, `quotes.linkInsertFailedRestoreFailed`)
added to both `messages/ar/api.json` and `messages/en/api.json`, following the existing
`clientLinkFailed`/`onboardingLinkRollbackFailed` naming convention in the same file.

### Finding 2 (minor): race-loss branch showed a success toast with nothing to copy

**The bug.** `components/quotes/PublicLinkDialog.tsx`'s `handleCreate` treated any
non-throwing mutation result as success — including the legitimate race-loss `{token:
null, url: null}` response — so it set `mintedUrl` to `null` and still fired
`toast.success(t('createSuccessToast'))`. The user was told "signing link created" with
nothing in the dialog to copy.

**The fix.** `handleCreate` now branches on `result.token`: if it's `null`, it skips the
success toast and instead shows `toast.info(t('raceLostToast'))` — an existing pattern in
this codebase (`toast.info` is already used in `public-quote-view.tsx`, `NotificationBell.tsx`,
and others). Added `finance.quotes.publicLink.raceLostToast` to both
`messages/ar/finance.json` and `messages/en/finance.json`.

**The three unused keys** (`createdAtLabel`, `loading`, `revoking` under
`quotes.publicLink`) — confirmed unreferenced anywhere in `PublicLinkDialog.tsx` or any
other file (grepped the whole repo for the literal key names and for
`t('createdAtLabel')`/`t('loading')`/`t('revoking')` — zero hits outside the JSON
catalogs themselves). **Removed** from both `messages/ar/finance.json` and
`messages/en/finance.json` rather than wiring them in — the component already shows
`<Skeleton>` while loading (not a text string) and has no separate "revoking…" affordance
on the confirm button beyond the existing `Loader2` spinner, so inventing UI to consume
them would be scope creep outside this fix.

### Verification

Dev server (`next dev --turbopack`) started via the launch config; hit
`GET /api/quotes/qt_ca8CD32kV1HMpqZw/link` unauthenticated first to confirm the modified
route module loads cleanly in the real Next.js runtime (`401`, not `500`).

`requireApiPermission()` depends on `next/headers` `cookies()`, which only exists inside
a live request — there is no way to call the exported route handlers directly from a
script outside the framework. Per the task's own suggested method ("inject the failure
... in a scratch copy of the code path"), the DB-level revoke/insert/restore mechanics —
the actual subject of the fix — were verified by a standalone script
(`scripts/_scratch-verify-link-rollback.ts`, run via `npx tsx` from the repo root then
deleted — never committed) that issues the *exact same* Supabase queries as the fixed
route, against throwaway `qt_t7f_verify` / `dl_t7f_*` rows only. `pyra_document_links` was
confirmed empty (`count: 0`) before the script ran.

**(a) Normal mint still works and revokes the previous link.** Minted `dl_t7f_1` (fresh,
`revoked_at: null`), then minted `dl_t7f_2` — the mint revoked `dl_t7f_1` first (captured
`revokedRows = [{id:'dl_t7f_1'}]`) and inserted `dl_t7f_2`. Post-state read back from the
DB: `dl_t7f_1.revoked_at = "2026-07-28T06:13:37.935+00:00"` (NOT NULL),
`dl_t7f_2.revoked_at = null`. **PASS.**

**(b) Insert forced to fail after the revoke succeeds → previous link restored to live.**
Revoked `dl_t7f_2` (captured `revokedLinkId = 'dl_t7f_2'`, confirming a row *was* live to
restore). Forced the insert to fail by passing `token: null` on the insert payload —
`pyra_document_links.token` is `character varying NOT NULL` with no default (confirmed via
`information_schema.columns` before writing the script) — which raises Postgres
`23502 not_null_violation`, a genuine constraint violation and explicitly **not**
`23505`. Real error returned: `null value in column "token" of relation
"pyra_document_links" violates not-null constraint`. The script then ran the identical
restore statement the route now runs (`UPDATE ... SET revoked_at = NULL, revoked_by =
NULL WHERE id = 'dl_t7f_2'`). Read back: `dl_t7f_2.revoked_at = null`. **PASS** — the
previously-live link is live again after a non-23505 insert failure.

**(c) Race-loss branch unchanged: 200, null token, no un-revoke.** With `dl_t7f_2` live
again (from step b), simulated the race winner: revoked `dl_t7f_2` and inserted
`dl_t7f_4` (live). Simulated the loser — whose own revoke was already a no-op because the
winner got there first — by inserting a 5th row for the same `entity_id` while
`dl_t7f_4` was live: got back `error.code: '23505'` exactly, confirming the unique
partial index (`idx_document_links_one_live`) is what fires, not the NOT NULL path.
Reproduced the route's (untouched) 23505 branch: fetched the live row and built
`{exists:true, ...existing, token:null, url:null}` — `response.token === null`, and this
is `apiSuccess()` territory (`200`), not `apiServerError()`. Crucially, checked the
row the winner superseded (`dl_t7f_2`) was **not** touched by any restore logic: its
final state was `revoked_at: "2026-07-28T06:13:38.827+00:00"` (still NOT NULL,
`revoked_by: "t7f_verify_script"`) — the 23505 branch never calls the new restore code,
so it correctly leaves the properly-superseded row revoked. **PASS.**

**Cleanup:** script deleted all `dl_t7f_%` rows and the `qt_t7f_verify` quote itself,
then re-queried: `pyra_document_links` count `0`. Confirmed separately via `pnpm db:query`
after the script exited: `pyra_quotes` has zero rows matching `qt_t7f_%`,
`pyra_document_links` count is `0`, and `qt_ca8CD32kV1HMpqZw` is still `status: "sent"` —
never read or written by any step above. The scratch script itself was deleted (it was a
temporary copy placed under `scripts/` only so Node module resolution could find
`node_modules`; `git status` after the run shows no trace of it).

### Gates

- `pnpm run check` (`tsc --noEmit && i18n-check`) → clean, `i18n:check ✓ clean`.
- `pnpm test` → `840 passed`, the same 1 pre-existing unrelated failure in
  `__tests__/atomic-task-write-routes.test.ts` flagged as expected — untouched by this
  fix.
- `pnpm build` → not run (OOMs on this machine per instructions).

### Files touched (this addendum)

- `app/api/quotes/[id]/link/route.ts` (modified — capture revoked row id, restore-on-failure branch)
- `components/quotes/PublicLinkDialog.tsx` (modified — branch on `result.token === null`)
- `messages/ar/api.json`, `messages/en/api.json` (modified — 2 new keys under `quotes`)
- `messages/ar/finance.json`, `messages/en/finance.json` (modified — 1 new `raceLostToast` key added, 3 unused keys removed from `quotes.publicLink`)

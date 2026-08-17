# WhatsApp per-agent line (`yellow`) — connect + ownership

**Date:** 2026-08-17
**Status:** design — awaiting `yellow` instance token + phone number
**Scope:** Phase 0 (make `yellow` send/receive) + Phase 1 (`yellow` is its holder's private line).
Phase 2 (WhatsApp → lead timeline / follow-up-close-from-chat / sync cron) is a **separate spec**.

---

## 1. Goal

The company owns WhatsApp phones named by COLOUR (not by person, because the holding
employee rotates). The company line `pyraai` is the shared lead-intake line. A colour
line (`yellow`, currently held by Youssef) should let its holder chat clients **from
inside the system** and see those chats as **their own** inbox — the way the calls
system gives each rep their own device/leads. Adding it must NOT disturb the company
line or its internal-notification delivery.

## 2. Verified ground truth (live, 2026-08-17)

Confirmed by reading the code + a read-only Evolution probe + the live DB:

- **`yellow` exists in Evolution** (`connectionState/yellow` → 401 = exists-but-unauthorized;
  `asfar`/`aswar` → 404 = absent — the instance name is literally `yellow`).
- **The app's `EVOLUTION_API_KEY` is `pyraai`'s instance token, NOT a global key**:
  `fetchInstances` returns exactly one instance (pyraai); `connectionState` = pyraai 200 /
  selver 401 / yellow 401. So the app cannot drive `yellow` — or read its token — with the
  current key.
- **No `pyra_whatsapp_instances` row for `yellow` yet.** Connecting the phone in Evolution
  ≠ registered in the system.
- **Notification hijack is already guarded**: `pyraai.is_notification_line = true`, partial
  unique index enforces one, `pickSenderInstance` filters designated-before-recency,
  `pyra_agent_whatsapp_settings` empty. A new line defaults `is_notification_line = false`.
- **Visibility is 100% by `pyra_whatsapp_conversations.assigned_to`** — admin sees all;
  a non-admin agent sees ONLY conversations assigned to them (`conversations/route.ts:94-104`).
  `pyra_whatsapp_instances.agent_username` is currently dead metadata (read by no scoping path).
- **The per-instance-token pattern already exists** — the internal-notification path
  (`lib/notifications/whatsapp.ts:150-154`) already looks up an instance's `api_key` and passes
  it to `evolutionClient.sendText(name, payload, apiKey)`. `sendText` already accepts the
  override (`lib/evolution/client.ts:147`). The sales send + pull paths simply have not adopted it.

## 3. Approach decision — P (per-instance token), not G (global key as default)

| | **P — per-instance token (chosen)** | G — global key as app default |
|---|---|---|
| Code | thread each line's own token through send + pull (extend the pattern the notification path already uses) | ~none |
| Company line `pyraai` | **untouched** | its `?secret=` webhook key changes → re-register + master key in webhook URLs |
| Blast radius | none | touches the working line + downgrades secret handling |

**P** keeps the working company line and its notifications completely untouched, and is
the pattern already established in the codebase. The global key is needed only ONCE, to
read `yellow`'s own token — done from the Evolution panel by the owner; the app never
stores the global key.

## 4. Non-goals (explicit)

- WhatsApp messages writing to the lead timeline / `last_contact_at` — **Phase 2**.
- Closing a follow-up from the chat thread — **Phase 2**.
- A `whatsapp-sync` cron (capture currently runs only while the inbox tab is open) — **Phase 2**.
- Unifying the WhatsApp phone matcher onto `lib/calls/match.ts` — **Phase 2**.
- App-side create/QR of new lines from the settings screen (needs the global key wired in
  as a separate env var) — deferred; the owner onboards lines from the Evolution panel.

---

## 5. Design — Phase 0: make `yellow` send + receive

### 5a. `lib/evolution/client.ts` — accept a per-instance token where it's still missing
`sendText` already takes `apiKey`. Add the SAME optional `apiKey?: string` 4th/last argument to:
- `findAllMessages(instanceName, page, limit, apiKey?)` — the pull's read call.
- `sendMedia(instanceName, payload, apiKey?)` — document/media sends.
- `sendTextQuoted(instanceName, payload, apiKey?)` — quoted replies.
- `sendPresence(instanceName, remoteJid, state, apiKey?)` — typing indicator (best-effort).

Each forwards it into the existing private `request(method, path, body, apiKey)`, which
already supports the override. No behaviour change when `apiKey` is omitted (falls back to
the configured key), so `pyraai` calls are byte-identical to today.

### 5b. `lib/whatsapp/pull-messages.ts` — pull `yellow` with its own token (self-contained)
At the top of `pullInstanceMessages`, look the line up ONCE:
```ts
const { data: line } = await supabase
  .from('pyra_whatsapp_instances')
  .select('api_key, agent_username')
  .eq('instance_name', instanceName)
  .maybeSingle();
```
Pass `line?.api_key ?? undefined` to `findAllMessages(...)`. Keeping the lookup inside
`pullInstanceMessages` means **no change to `listPullableInstances` return shape and no
change to the poll route / any cron caller** — the smallest possible surface.
(`line.agent_username` is reused in Phase 1 below — one lookup serves both.)

### 5c. `app/api/dashboard/sales/whatsapp/send/route.ts` — reply from `yellow` with its token
After `instanceToUse` is resolved (already done at line 51-75), fetch that line's token and
pass it to the three send calls — mirroring `lib/notifications/whatsapp.ts`:
```ts
const { data: line } = await supabase
  .from('pyra_whatsapp_instances')
  .select('api_key')
  .eq('instance_name', instanceToUse)
  .maybeSingle();
const lineKey = line?.api_key ?? undefined;
// …sendMedia(instanceToUse, payload, lineKey)
// …sendTextQuoted(instanceToUse, payload, lineKey)
// …sendText(instanceToUse, { number, text }, lineKey)
```

### 5d. `typing/route.ts` + `send-pdf/route.ts` — same one-line token thread
Read each before editing (small routes); apply the identical `api_key` lookup + pass-through
so the typing indicator and PDF/document sends also work from `yellow`. Typing is best-effort
(swallows errors), so it is low-risk either way.

### 5e. Data — register the `yellow` row (once the token arrives)
Insert into `pyra_whatsapp_instances` (via a UTF-8 `.sql` file if any value is non-ASCII):
```
instance_name        = 'yellow'
agent_username       = 'youssef'          -- the current holder (Phase 1 uses this)
phone_number         = '<yellow number>'  -- from the owner
api_key              = '<yellow token>'   -- from the Evolution panel
webhook_url          = 'https://workspace.pyramedia.cloud/api/dashboard/sales/whatsapp/webhook?secret=<EVOLUTION_API_KEY>'
status               = 'connected'
auto_sync            = true               -- so listPullableInstances picks it up
is_notification_line = false              -- DEFAULT; never true (protects notifications)
```
`api_key` MUST stay server-side only — never add it to the client-facing instances list
(`WA_INSTANCE_FIELDS` / `GET /instances`).

---

## 6. Design — Phase 1: `yellow` is its holder's private line

The whole ownership requirement reduces to **auto-assigning a colour line's inbound to its
holder**, because existing scoping (`assigned_to`) then shows those chats to the holder +
admin and to no one else. No scoping-query change.

### 6a. `lib/whatsapp/pull-messages.ts` — assign new conversations to the line holder
Using `line.agent_username` from the 5b lookup, set `assigned_to` on the **new-conversation
INSERT only** (the existing `else` branch at ~line 244):
```ts
assigned_to: line?.agent_username ?? null,
```
Existing conversations are left as-is (no silent reassignment). Company-line behaviour is
preserved by 6b.

### 6b. Keep the company line shared — clear `pyraai.agent_username`
`pyraai.agent_username` is currently `'elharm'` (dead metadata). Set it to `NULL` so the
rule becomes: **holder set → personal line, inbound auto-assigns to holder; holder null →
shared line, inbound stays unassigned for the owner to distribute** (today's behaviour).
Precondition: grep-verify `agent_username` is not read by any scoping/assignment path before
the data change (audit says it is not — confirm at implementation time).

### 6c. Rotation (holder changes)
The existing settings PATCH accepts `agent_username`, so the admin re-points the holder there.
New inbound then auto-assigns to the new holder. Re-assigning already-open threads to the new
holder is done with the existing bulk-assign action — no new code this phase.

---

## 7. No-conflict guarantees (the owner's core concern)

- `pyraai`: token, `is_notification_line`, and shared distribution are **unchanged**. Its
  send/pull calls omit `apiKey` and behave exactly as today.
- `yellow` inserted with `is_notification_line = false` → cannot become the notification
  sender while `pyraai` stays designated (enforced by the partial unique index + designation
  filter).
- Per-line message isolation is already structural (instance-scoped storage, `UNIQUE(remote_jid,
  instance_name)`, reply-from-conversation-line). Adding `yellow` cannot mix threads with `pyraai`.
- `api_key` never leaves the server.

## 8. Testing

- **Unit:** existing `pickSenderInstance` tests stay green (untouched). Add a focused unit test
  for the new `assigned_to = holder` branch if `pull-messages` can be exercised in isolation;
  otherwise cover the holder rule with a small pure helper.
- **`pnpm test` + `pnpm run check` + `pnpm build`** must all pass before push.
- **Live, after the token is stored:**
  1. Probe with `yellow`'s OWN token → `connectionState/yellow` = 200 and `findMessages` returns
     rows (the app default key will still 401 `yellow` — expected; send/pull use the per-instance
     token, not the default key).
  2. Trigger a pull → a `yellow` inbound creates a conversation `assigned_to = youssef`; confirm
     Youssef (non-admin) sees it and another sales agent does not; the owner sees it.
  3. Reply from the thread → leaves from the `yellow` number.
  4. Confirm an internal notification still sends from `pyraai` (unchanged).

## 9. Rollout

Branch off, implement, `pnpm run check` + `pnpm build` + `pnpm test` green, commit. **Fetch
before pushing** (Abdou commits concurrently); pushing to `origin/main` auto-deploys via Coolify —
confirm intent before that push. The `yellow` row insert + `pyraai.agent_username` clear run via
`pnpm db:query`.

## 10. Needed from the owner

1. `yellow`'s **instance token** (Evolution panel → Instances → `yellow` → API key), and
2. `yellow`'s **phone number**.

(Global `AUTHENTICATION_API_KEY` is an acceptable fallback but not required — the scoped
per-line token is preferred.)

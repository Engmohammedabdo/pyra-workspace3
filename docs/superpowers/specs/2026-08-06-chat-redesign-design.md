# Chat Page Redesign — Approved Design (2026-08-06)

**Owner approval:** «اعتمد» on the HYBRID mockup, 2026-08-06. Mockups shown:
A (smart 3-pane messenger), B (operations room), C (deal cockpit), then a
hybrid combining all three. The hybrid is the approved design. Mockup HTML
files live in the session scratchpad (`chat-redesign-{mockup,option-b,option-c,hybrid}.html`);
the hybrid file is the visual source of truth for this spec.

## Why (the owner's three pains, verbatim answers)

1. «الشكل مش لايق بالنظام» — the page is a literal WhatsApp clone (hardcoded
   `#00a884`/`#f0f2f5`/`#111b21` hexes throughout) with no Pyra identity.
2. «مش عارف ألاقي المهم بسرعة» — no prioritization; a conversation waiting
   3 hours looks identical to a resolved one.
3. «الأدوات المهمة مستخبية» — create-lead / quote / invoice / follow-up are
   buried in dropdown menus.

Primary user: **the agent first**, with a clear admin oversight layer
(owner's choice). Mobile was explicitly NOT one of the pains — preserve the
existing responsive list/chat switch, don't redesign it.

## The approved hybrid — element by element

**Layout: TWO columns** (list ~340px + chat flex). The old third column is
absorbed by the deal banner; deep context becomes a drawer.

### Top bar (from A + C)
- Title + three counter chips that ARE filters: «محتاج رد N» (orange),
  «غير مسند N» (amber), «متأخر N» (red). Counts come from the server, not
  from the fetched page.
- Line switcher as a segmented control: الكل / الشركة / سيلفر (dot colors:
  orange for company, emerald for others) — promoted out of the filter
  popover (the popover section can stay; the segmented control is the
  primary affordance).
- Ctrl+K hint chip — v1 behavior: focuses the conversation search input.

### Conversation list (from A + B)
- Sections: «محتاج رد — الأقدم الأول» (needs-reply, oldest waiting first)
  then «باقي المحادثات» (recency). Resolved rows render dimmed (opacity).
- needs-reply predicate: `status='open' AND last_customer_message_at >
  COALESCE(last_agent_message_at, epoch)` (both columns already exist).
- Waiting chip on needs-reply rows: `⏱ ٤٥د / ٣س` — amber by default, red
  when waiting ≥ `LATE_THRESHOLD_MINUTES` (120).
- Row hover quick actions (B): «⤺ إسناد» (opens existing AssignDialog for
  that conversation) and «✓ حل» (status → resolved via existing mutation).
  Admin-only for إسناد (same gate the assign dialog already has).
- Line badge (emerald, non-company lines only) — already built, keep.
- All WhatsApp hexes replaced by theme tokens.

### Deal banner above the chat (from C) — replaces the old chat header
- Row 1: avatar, name, line badge, company/phone subtitle; KPIs at the end:
  «آخر تواصل» (lead.last_contact_at relative), «المصدر»; «👤 كارت العميل»
  dark button toggles the drawer. (Health chip: ONLY if an existing cheap
  hook provides it — do not build health computation for this.)
- Row 2: pipeline stage steps — all stages from `/api/crm/pipeline-stages`
  rendered as done/current/todo (done = emerald check, current = orange with
  halo). Read-only in v1 (stage changes happen on the lead page).
- Row 3: action buttons always visible: «＋ عرض سعر» (primary orange),
  فاتورة, متابعة, ملاحظة, إسناد — all open the EXISTING dialogs; plus the
  open-follow-up chip «⏰ متابعة: …» when one exists.
- When the conversation has NO linked lead: banner degrades to row 1 only +
  a «إنشاء عميل» primary action (existing create-lead dialog).

### Drawer (from B) — replaces the fixed third column
- Slide-over from the chat's end side, reusing the existing contact-panel
  content restyled with tokens; close button; does not push the chat.

### Messages + input (from A + C)
- Bubbles: incoming = card surface + hairline border; outgoing = orange-soft
  (`#FFF7ED`-equivalent token) + orange border. Day separators as pills.
- Internal note bubble: amber dashed border + «🔒 ملاحظة داخلية» tag —
  unmistakably different from an outgoing message.
- Inline call events (C): the linked lead's `call_logged` / `call_attempt`
  activities merged into the thread by timestamp as centered system pills
  («📞 مكالمة ٥:٢٠ — يوسف» / «☎ محاولة اتصال — لم يرد»).
- Input bar: رد/ملاحظة segmented toggle + round orange send button (keep
  existing send/note logic).

## Identity / theme

- Pyra Pro warm palette via the existing `.crm-theme` scope class applied to
  the chat page container (tokens: canvas `#FBFAF9`, ink `#1C1917`, warm
  surface `#F5F3F1`, border `#F1EDE8`, taupe `#7A7570`, primary orange
  `#F97316` inherited from :root). Dark mode comes free from the existing
  `.dark .crm-theme` block — NO hardcoded hexes in components.
- RTL logical properties only (`ms-/me-/ps-/pe-/start-/end-`).

## Hard constraints

- **Data layer untouched.** Hooks (`hooks/useWhatsApp.ts`), store
  (`use-chat-store.ts` — additive changes only), APIs and the webhook/poll
  ingestion stay as-is except: conversations GET gains server-side counts
  (meta) and the store gains a `quickFilter` field.
- Existing dialogs (assign / create-lead / quote / invoice / follow-up /
  note / snooze / label / merge / forward) are REUSED, not rewritten.
- Multi-line invariants (locked 2026-08-06): never hardcode `'pyraai'`,
  replies leave from the conversation's line, line badge/filter preserved.
- Files < 300 lines; split into focused components.
- i18n: the chat surface is Phase 6e (not yet migrated) — new components
  keep Arabic literals, consistent with the rest of `components/sales/chat`.
  Do NOT start the catalog migration inside this redesign.
- Mobile: preserve the existing list/chat switch behavior; the drawer must
  work as a full-screen sheet on mobile.

## Out of scope (explicitly)

- WhatsApp → lead-timeline writes and `last_contact_at` from chat messages
  (separate backlog item), assignment phone notification (separate item),
  auto-assignment (parked by owner), SLA/CSAT logic changes (restyle
  badges only), campaigns/groups pages, pyraai webhook routing, i18n
  migration, historical selver import.

## Acceptance (what the owner verifies after deploy)

1. Page reads as Pyra Pro — zero WhatsApp green anywhere.
2. «محتاج رد» section on top, oldest first, waiting chips go red past 2h;
   counter chips filter the list on click.
3. Quote/invoice/follow-up/note/assign reachable in ONE click from the
   banner; stage steps show the linked lead's real stage.
4. Row-level assign works from the list without opening the conversation.
5. Replying still leaves from the conversation's own line (regression gate).

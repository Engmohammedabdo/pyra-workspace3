import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { phoneMatchKey } from '@/lib/utils/phone';
import { buildLeadPhoneIndex, matchLeadByPhone, isConnectedCall, isOwnedByAgent } from '@/lib/calls/match';
import { buildColleagueCallNotice } from '@/lib/calls/colleague-call-notice';
import { notify } from '@/lib/notifications/notify';
import { parseCallsBatch, MAX_BATCH } from '@/lib/mobile/parse-calls';
import { logError } from '@/lib/observability/log-error';
import { FOLLOW_UP_STATUS } from '@/lib/constants/statuses';

// T-02 — parsing moved to lib/mobile/parse-calls.ts, where it is unit-tested and
// where the reasoning lives. The behaviour change that matters: a single
// unparseable row is now DROPPED rather than 422-ing the whole batch, because
// the device cursor only advances on a 2xx and one bad row therefore used to
// freeze that handset's sync permanently.

/**
 * POST /api/mobile/calls/sync
 *
 * Ingests a batch of SIM call-log rows from the Android call-tracking app.
 * Auth: device x-api-key (`calls:device`) via `requireDeviceAuth`.
 *
 * Per-call outcome, echoed back so the device drives its local
 * notifications (every 'unmatched' fires the «رقم غير مسجل» prompt):
 *   - 'duplicate' — device_call_key already synced for this agent (seen in
 *     the pre-check SELECT, repeated within the SAME batch, or caught via
 *     the unique-constraint race on insert — double-sync safe either way)
 *   - 'matched'   — phone matched an existing lead the calling agent OWNS.
 *     If the call was CONNECTED (`isConnectedCall`: direction != 'missed' AND
 *     duration_seconds > 0) this ALSO writes a `call_logged`
 *     pyra_lead_activities row + bumps the lead's last_contact_at. A
 *     matched but UNANSWERED dial (direction != 'missed' AND
 *     duration_seconds === 0) writes a `call_attempt` activity instead —
 *     visible on the timeline as effort, but it does NOT bump
 *     last_contact_at and every "last touched" consumer (lead-idle-check,
 *     deals-at-risk, ai-insights, the customer dossier health score)
 *     excludes activity_type='call_attempt' so an unanswered dial can never
 *     look like contact. Missed calls get NO timeline activity and NO
 *     last_contact_at bump at all (design lock — see call-tracking spec).
 *     A match on a lead the agent does NOT own writes neither (see below).
 *   - 'ignored'   — phone matched a row in this agent's pyra_ignored_numbers
 *   - 'unmatched' — no lead, not ignored
 *   - 'error'     — the pyra_agent_calls insert failed for a NON-unique-
 *     violation reason (DB hiccup). Nothing was persisted for this call;
 *     the phone keeps it queued locally and retries on the next sync.
 *
 * OWNERSHIP GATE. The lead index is system-wide by design (a rep really can
 * dial a number that belongs to a colleague's lead), so a call to a
 * COLLEAGUE's lead still resolves to status 'matched'. What it must NOT do is
 * act on that match. Every 'matched' result carries `owned: boolean` (whole-
 * wave review Gap 2, 2026-07-25 — additive; a pre-v1.4 phone decodes with
 * ignoreUnknownKeys and never sees it), and as of the Gap-2 close `owned`
 * GATES three things server-side rather than merely being reported:
 *   - the `call_logged` / `call_attempt` pyra_lead_activities write,
 *   - the `last_contact_at` bump,
 *   - `lead_id` + `lead_name` in the response (an unowned match returns
 *     `owned: false` alone — see the response comment for why the key itself
 *     must still be sent and why `status` must stay 'matched').
 *
 * THE TWO TIMELINE WRITES AND THE BUMP MOVE AS ONE. Gating only the
 * `last_contact_at` bump would not fix anything: `lead-idle-check`
 * (app/api/cron/lead-idle-check/route.ts) computes `lastTouched` as
 * max(latest activity created_at EXCLUDING activity_type='call_attempt',
 * last_contact_at) with NO `created_by` filter — so a surviving `call_logged`
 * row written by a non-owner keeps suppressing the real owner's going-cold
 * nudge, and the one measured harm outlives the "fix". Never split them.
 *
 * `pyra_agent_calls.lead_id` is deliberately STILL SET on an unowned match.
 * Nulling it would hand the row to `retroLinkCalls` (selects unlinked calls by
 * phone_normalized with no agent filter) on the next quick-add, which would
 * re-write exactly the activities this gate just suppressed; and
 * /api/mobile/calls/ignore guards only on `if (call.lead_id) return 409`, so a
 * null link would let the caller mark a colleague's customer number as
 * ignored — dropping those rows out of every bucket in lib/calls/report.ts
 * and erasing the caller's own workload. Keeping the link is what makes the
 * gate hold.
 *
 * Persistence ordering: the pyra_agent_calls row is inserted FIRST (with
 * activity_id null); the call_logged/call_attempt activity (+ last_contact_at
 * bump for call_logged only) run only AFTER the row is durable, then the
 * row's activity_id is back-filled. A failed/raced row insert therefore
 * never leaves an orphan timeline activity or a phantom last_contact_at
 * bump behind.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    // displayName is used by the F-07 notice below — the lead's owner should
    // read "كوزيت كلّمت عميلك", not a raw username.
    const { agentUsername, displayName: agentDisplayName } = auth;

    const body = await request.json().catch(() => null);
    const parsed = parseCallsBatch(body?.calls);
    // null means the ENVELOPE is unusable (not an array / empty / oversized) —
    // a client bug, so the device should hear about it. Bad ROWS inside a valid
    // envelope no longer land here; they are dropped below.
    if (!parsed) return apiError(`calls مطلوبة (حد أقصى ${MAX_BATCH})`, 422);
    const { calls, dropped } = parsed;

    if (dropped.length > 0) {
      // Visible, not silent. Dropping a row is the right call — it can never be
      // persisted, so re-sending it forever would freeze the cursor — but a
      // dropped row is still lost call data, and the only thing standing between
      // that and an invisible hole is this log. `device_call_key` may be null
      // when the key itself was the invalid part; the index identifies it then.
      logError({
        error: `calls/sync dropped ${dropped.length} unparseable call row(s)`,
        request,
        metadata: { action: 'mobile_calls_sync_dropped_rows', agentUsername, dropped },
      });
    }

    // Every row was unparseable. Answer 2xx with no results so the device's
    // cursor advances past rows that can never be stored — a 422 here would
    // recreate exactly the freeze T-02 removes. Returning early also keeps the
    // queries below off an empty `.in()` list.
    if (calls.length === 0) return apiSuccess({ results: [] });

    const supabase = createServiceRoleClient();

    // 1. duplicates: already-synced device_call_keys are echoed back as 'duplicate'
    const keys = calls.map((c) => c.device_call_key);
    const { data: existing } = await supabase
      .from('pyra_agent_calls')
      .select('device_call_key')
      .eq('agent_username', agentUsername)
      .in('device_call_key', keys);
    const existingKeys = new Set((existing ?? []).map((r) => r.device_call_key));

    // 2. lead index + ignore list
    // `assigned_to` is selected so each matched result can carry an `owned`
    // flag — this index stays system-wide ON PURPOSE (no assigned_to filter),
    // so a call to a COLLEAGUE's lead still matches; `owned` then gates what
    // that match is allowed to DO (see the ownership gate below). Filtering
    // the index by agent instead would return 'unmatched', which fires the
    // app's «رقم غير مسجل» quick-add prompt → POST /api/mobile/leads builds
    // its OWN unfiltered index, hands back the colleague's lead id, name and
    // dashboard URL and calls retroLinkCalls() — a louder leak plus more
    // duplicate-lead pressure.
    //
    // `.order('created_at')` + `.range()` + the `agentUsername` preference are
    // three separate fixes to the same read:
    //  - the PREFERENCE breaks a duplicate-key tie toward the caller's own
    //    lead row. Duplicate lead cards for one business on one number are
    //    real (18 phone keys in prod carry >1 lead), and without this an
    //    ownership gate would silently erase 14 of 25 real cross-agent
    //    conversations whose caller in fact owned their own row on that number.
    //  - the ORDER makes it reproducible: without an ORDER BY, WHICH duplicate
    //    wins — and therefore the value of `owned` itself — differs between
    //    two syncs of the same number. `owned` now gates writes, so a
    //    non-deterministic read is a non-deterministic security decision.
    //    `created_at` alone is not total: 3 of the 18 duplicate phone keys in
    //    prod carry rows whose created_at is identical to the microsecond, so
    //    `id` follows as a TIEBREAKER for those — it is not a preference for
    //    lower ids, it exists purely to make the winner reproducible. (All 3
    //    are single-owner, so no `owned` decision ever flipped on this; what
    //    did vary is WHICH of one owner's two duplicate cards received the
    //    activity and the last_contact_at bump, splitting one number's history
    //    across both cards.)
    //  - the RANGE is DEFENSIVE, not corrective: measured directly against
    //    prod (2026-08-07) this instance returned `Content-Range: 0-1244/1245`
    //    for the un-ranged select — all 1,245 phone-bearing leads, NO cap. It
    //    is self-hosted Supabase with no `db-max-rows` configured, so nothing
    //    was being truncated. Kept deliberately: if `db-max-rows` is ever set,
    //    a silently truncated index would degrade real leads to 'unmatched' →
    //    quick-add prompt → MORE duplicate leads, i.e. it would feed the exact
    //    failure this route exists to reduce. The ceiling it installs is
    //    100,000 rows (offsets 0-99,999) — well past the current 1,245, but it
    //    IS a ceiling, so revisit it before the lead table approaches it.
    const { data: leads, error: leadsErr } = await supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, assigned_to')
      .not('phone', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, 99999);
    if (leadsErr) throw leadsErr;
    const index = buildLeadPhoneIndex(leads ?? [], agentUsername);

    // `agent_username = '*'` is a FLEET-WIDE ignore (the company's own lines,
    // the owner's mobile) — same wildcard convention the cron scopes use. Any
    // other value is that one agent's personal ignore list. A per-agent row is
    // deliberately NOT required for the company numbers: a newly provisioned
    // agent must inherit them on day one, not after someone remembers to add
    // four rows.
    const { data: ignoredRows, error: ignoredErr } = await supabase
      .from('pyra_ignored_numbers')
      .select('phone_normalized')
      .in('agent_username', [agentUsername, '*']);
    // a read failure here would misclassify every ignored number as
    // 'unmatched' and persist that wrong status permanently — abort instead.
    if (ignoredErr) throw ignoredErr;
    const ignoredSet = new Set((ignoredRows ?? []).map((r) => r.phone_normalized));

    // processedKeys grows as the batch is processed — catches the same
    // device_call_key repeated WITHIN one batch (existingKeys alone only
    // covers keys already in the DB before this request).
    // Known edge: a key whose FIRST occurrence in the batch results in
    // status 'error' (insert failed) is still added to processedKeys below,
    // so a second in-batch occurrence of that same key would report
    // 'duplicate' even though nothing was actually persisted. Our
    // cursor-based Android app never re-sends the same device_call_key
    // twice within one batch, so this can't happen in practice — accepted
    // for v1.
    const processedKeys = new Set(existingKeys);
    interface SyncResultOut {
      device_call_key: string;
      status: 'duplicate' | 'error' | 'unmatched' | 'ignored' | 'matched';
      lead_id?: string;
      lead_name?: string;
      owned?: boolean;
      // Additive (wave C): the agent's earliest OPEN follow-up on the matched
      // lead, so the phone's notification can open the outcome sheet with the
      // follow-up already attached. An older app ignores unknown keys.
      open_follow_up_id?: string | null;
      // Fix 1 (wave C audit): `open_follow_up_id` alone let the notification
      // pre-check the sheet's "close this follow-up" switch while showing the
      // rep nothing about WHAT it would close — a switch defaulted on over a
      // blank card. These three ride along with the id (present exactly when
      // `open_follow_up_id` is non-null) so the sheet can render the actual
      // follow-up before the rep commits to closing it.
      open_follow_up_title?: string | null;
      open_follow_up_due_at?: string | null;
      open_follow_up_overdue?: boolean;
    }
    const results: SyncResultOut[] = [];
    for (const call of calls) {
      if (processedKeys.has(call.device_call_key)) {
        results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        continue;
      }
      processedKeys.add(call.device_call_key);

      const normalized = phoneMatchKey(call.phone);
      const connected = isConnectedCall(call);
      // IGNORE BEATS THE LEAD MATCH — order is load-bearing. The old order
      // (`lead ? 'matched' : ignored…`) meant the ignore list was skipped
      // entirely whenever a lead happened to carry that phone, and the owner's
      // own two numbers WERE saved as leads ("boss", "mohamed abdou"), so 24
      // internal calls were filed as customer contact and 13 activities were
      // written onto those cards. Ignoring first also nulls `lead`, so an
      // ignored call writes no timeline row and never moves last_contact_at,
      // even if someone re-creates a lead on that number tomorrow.
      const isIgnored = ignoredSet.has(normalized);
      const lead = isIgnored ? null : matchLeadByPhone(index, call.phone);
      const matchStatus = isIgnored ? 'ignored' : lead ? 'matched' : 'unmatched';

      // OWNERSHIP GATE — both timeline writes AND the last_contact_at bump
      // below require it, and they MUST move together (see the doc comment at
      // the top of this route for why). `isOwnedByAgent` is
      // `lead.assigned_to === agentUsername`, byte-identical to the gate in
      // /api/mobile/call-outcome, so a lead with assigned_to NULL fails closed.
      const owned = isOwnedByAgent(lead, agentUsername);

      // Persist the call row FIRST (activity_id back-filled below) so a
      // failed insert never leaves an orphan activity / phantom
      // last_contact_at bump behind.
      const callId = generateId('ac');
      const { error: insErr } = await supabase.from('pyra_agent_calls').insert({
        id: callId,
        agent_username: agentUsername,
        phone_raw: call.phone,
        phone_normalized: normalized,
        direction: call.direction,
        duration_seconds: call.duration_seconds,
        called_at: call.called_at,
        device_call_key: call.device_call_key,
        lead_id: lead?.id ?? null,
        activity_id: null,
        match_status: matchStatus,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          // unique-violation race (double sync) → report as duplicate
          results.push({ device_call_key: call.device_call_key, status: 'duplicate' });
        } else {
          // real DB failure — nothing persisted; 'error' tells the phone to
          // keep the call queued and retry it on the next sync
          logError({
            error: insErr,
            request,
            metadata: { action: 'mobile_calls_sync_insert', device_call_key: call.device_call_key },
          });
          console.error('[calls/sync] call insert failed:', insErr.message);
          results.push({ device_call_key: call.device_call_key, status: 'error' });
        }
        continue;
      }

      // Side effects AFTER the call row is durable: timeline activity +
      // last_contact_at bump (matched CONNECTED calls the agent OWNS only).
      if (lead && owned && connected) {
        const activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: lead.id,
          activity_type: 'call_logged',
          description: null,
          metadata: {
            duration_minutes: Math.round((call.duration_seconds / 60) * 10) / 10,
            duration_seconds: call.duration_seconds,
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            auto: true,
            source: 'device_sync',
            called_at: call.called_at,
          },
          created_by: agentUsername,
        });
        if (actErr) {
          // non-fatal — the call row stays with activity_id null
          console.error('[calls/sync] activity insert failed:', actErr.message);
        } else {
          const { error: linkErr } = await supabase
            .from('pyra_agent_calls')
            .update({ activity_id: activityId })
            .eq('id', callId);
          if (linkErr) {
            console.error('[calls/sync] activity_id back-fill failed:', linkErr.message);
          }
          const { error: bumpErr } = await supabase
            .from('pyra_sales_leads')
            .update({ last_contact_at: call.called_at })
            .eq('id', lead.id);
          if (bumpErr) {
            console.error('[calls/sync] last_contact_at bump failed:', bumpErr.message);
          }
        }
      } else if (lead && owned && call.direction !== 'missed') {
        // Matched but unanswered (0-second outgoing/incoming dial): visible on
        // the timeline as effort, but NOT contact — no last_contact_at bump,
        // and every "last touched" consumer excludes activity_type=call_attempt
        // (lead-idle-check, deals-at-risk, ai-insights, dossier health score).
        // Missed inbound calls stay excluded entirely — they are not the
        // agent's attempt.
        const activityId = generateId('la');
        const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
          id: activityId,
          lead_id: lead.id,
          activity_type: 'call_attempt',
          description: null,
          metadata: {
            direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
            duration_seconds: 0,
            auto: true,
            source: 'device_sync',
            called_at: call.called_at,
          },
          created_by: agentUsername,
        });
        if (actErr) {
          // non-fatal — the call row stays with activity_id null
          console.error('[calls/sync] call_attempt activity insert failed:', actErr.message);
        } else {
          const { error: linkErr } = await supabase
            .from('pyra_agent_calls')
            .update({ activity_id: activityId })
            .eq('id', callId);
          if (linkErr) {
            console.error('[calls/sync] call_attempt activity_id back-fill failed:', linkErr.message);
          }
        }
      } else if (lead && !owned && connected && lead.assigned_to) {
        // ── F-07: tell the lead's OWNER, since nothing else will ────────────
        //
        // This is the compensating change for the ownership boundary (B-12).
        // The two branches above write to the lead; this one deliberately does
        // not — `owned` is false, and writing here is exactly the hole B-12
        // closed. So the notification is the ONLY signal the owner ever gets,
        // and `buildColleagueCallNotice` is verbose for that reason.
        //
        // CONNECTED only. An unanswered dial at a colleague's customer is
        // effort, not contact — the same predicate every other consumer uses
        // (`isConnectedCall`), and the locked calls decision that `call_attempt`
        // is never a touch. Notifying on those would turn a wrong number
        // redialled three times into three alerts about nothing.
        //
        // Placed AFTER the call row is durable (the `continue` on insert
        // failure above already skipped us), so the owner is never told about a
        // call that was not recorded.
        //
        // The `lead.assigned_to` guard in the condition is NOT redundant with
        // `!owned`. isOwnedByAgent fails CLOSED for a null assignee — an
        // unassigned lead is owned by nobody — so such a lead reaches exactly
        // this branch, and there is no one to notify. (0 of 1,245 phone-bearing
        // leads are unassigned today, which is precisely why an unguarded
        // `to: null` would have sat here undetected until the day someone
        // unassigns one.)
        //
        // notify() — never a direct INSERT: it enforces the row shape, skips
        // self-notification (impossible here, since !owned means assigned_to
        // differs from the caller) and drops recipients whose account is not
        // active, which a departed owner's lead would otherwise re-alert
        // forever.
        const notice = buildColleagueCallNotice({
          leadId: lead.id,
          leadName: lead.name,
          callerDisplayName: agentDisplayName,
          callerUsername: agentUsername,
          direction: call.direction,
          durationSeconds: call.duration_seconds,
          calledAtIso: call.called_at,
        });
        await notify(supabase, {
          to: lead.assigned_to as string,
          type: 'lead_called_by_colleague',
          title: notice.title,
          message: notice.message,
          link: notice.link,
          entity: { type: 'lead', id: lead.id },
          from: { username: agentUsername, displayName: agentDisplayName },
        });
      }

      results.push({
        device_call_key: call.device_call_key,
        status: matchStatus,
        // An UNOWNED match returns `owned: false` and NOTHING ELSE — the
        // colleague's lead id and name are withheld, because the calling
        // agent has no business learning either from a wrong-number dial.
        //
        // Three things here are load-bearing, all verified against both live
        // app versions:
        //  1. `owned: false` MUST still be sent. Both live versions compute
        //     `val owned = r.owned != false`, i.e. absent/null means OWNED by
        //     design (so an older server can't silence a legitimate
        //     notification). Dropping the key while omitting the identity
        //     would make v7/v8 START notifying for a colleague's lead.
        //  2. `status` stays 'matched'. Downgrading to 'unmatched' fires the
        //     «رقم غير مسجل» quick-add prompt, and POST /api/mobile/leads
        //     builds its own UNFILTERED index, returns the colleague's lead
        //     id + name + dashboard URL with already_existed:true and calls
        //     retroLinkCalls — a louder leak than the one being closed.
        //  3. Omitting the fields is a no-op on both live versions:
        //     SyncWorker.kt gates its matched branch on
        //     `status == "matched" && lead_id != null && lead_name != null`,
        //     which short-circuits before `owned` is read. The phone shows
        //     exactly what it shows today for an unowned match: nothing.
        //
        // `owned` itself is additive (v1.4+) — a pre-v1.4 phone's decoder uses
        // ignoreUnknownKeys and never sees it.
        ...(lead ? (owned ? { lead_id: lead.id, lead_name: lead.name, owned: true } : { owned: false }) : {}),
      });
    }

    // ── Attach each matched lead's earliest OPEN follow-up ────────────────
    // ONE query for the whole batch, not one per call. Two independent
    // `assigned_to` columns are in play here and must not be conflated:
    // the query's `.eq('assigned_to', agentUsername)` constrains the
    // FOLLOW-UP row's owner, while `matchedLeadIds` below is filtered on
    // the LEAD's owner (`r.owned`, derived from `lead.assigned_to`). Both
    // gates are required — `pyra_sales_follow_ups.assigned_to` is
    // independent of `pyra_sales_leads.assigned_to` (the CRM's lead-
    // reassignment feature does not bulk-move follow-ups), so an agent can
    // still hold an open follow-up on a lead reassigned away from them.
    // Filtering only one of the two would let that case leak a colleague's
    // follow-up id onto a lead the agent can't post an outcome against
    // (the app already suppresses the outcome notification when
    // `owned: false`, and the outcome POST 403s regardless).
    //
    // The `.in()` list is bounded by the batch size (100 calls, deduped to
    // distinct OWNED leads), so it is nowhere near the URL-length class that
    // killed the idle-check cron — no chunk() needed.
    //
    // Best-effort: a failure here leaves the field absent, which the app reads
    // as "no follow-up attached". It must never fail a sync that already
    // persisted calls.
    const matchedLeadIds = Array.from(
      new Set(
        results
          .filter((r) => r.owned)
          .map((r) => r.lead_id)
          .filter((x): x is string => !!x),
      ),
    );
    if (matchedLeadIds.length > 0) {
      // `title` + `status` added for Fix 1 (wave C audit) — see the
      // SyncResultOut field comments above for why. Everything else about
      // this query is unchanged: one query for the whole batch, the same
      // `.eq('assigned_to', agentUsername)` scoping the FOLLOW-UP row's
      // owner (independent of the LEAD-owner `owned` gate — see the doc
      // comment above this block), and the same due_at ASC ordering.
      const { data: openFollowUps, error: fuErr } = await supabase
        .from('pyra_sales_follow_ups')
        .select('id, lead_id, due_at, title, status')
        .eq('assigned_to', agentUsername)
        .in('lead_id', matchedLeadIds)
        .in('status', [FOLLOW_UP_STATUS.PENDING, FOLLOW_UP_STATUS.OVERDUE])
        .order('due_at', { ascending: true });
      if (fuErr) {
        console.error('[calls/sync] open follow-up lookup failed:', fuErr.message);
      } else {
        // Ordered due_at ASC, so the FIRST row seen per lead is the earliest.
        interface EarliestFollowUp {
          id: string;
          title: string | null;
          dueAt: string;
          overdue: boolean;
        }
        const earliestByLead = new Map<string, EarliestFollowUp>();
        for (const fu of openFollowUps ?? []) {
          const leadId = fu.lead_id as string | null;
          if (leadId && !earliestByLead.has(leadId)) {
            earliestByLead.set(leadId, {
              id: fu.id as string,
              title: (fu.title as string | null) ?? null,
              dueAt: fu.due_at as string,
              overdue: fu.status === FOLLOW_UP_STATUS.OVERDUE,
            });
          }
        }
        for (const r of results) {
          // Mirrors the `owned` gate on matchedLeadIds above — an unowned
          // match is never given the field at all, rather than being given
          // `null`.
          if (r.lead_id && r.owned) {
            const fu = earliestByLead.get(r.lead_id);
            r.open_follow_up_id = fu?.id ?? null;
            if (fu) {
              r.open_follow_up_title = fu.title;
              r.open_follow_up_due_at = fu.dueAt;
              r.open_follow_up_overdue = fu.overdue;
            }
          }
        }
      }
    }

    return apiSuccess({ results });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_calls_sync' } });
    return apiServerError();
  }
}

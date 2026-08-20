#!/usr/bin/env tsx
/**
 * One-time: replay the pull's lead-touch pass over the yellow messages that were
 * imported by the FIRST backfill (before the Task 6 lead-feed existed). Uses the
 * REAL feed functions (shouldWriteLeadTouch / writeWhatsAppLeadTouch) so it both
 * proves the feed live and seeds the owned leads' WhatsApp timelines. Deduped —
 * safe to re-run.
 */
import { existsSync, readFileSync } from 'node:fs';

for (const file of ['.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  const { shouldWriteLeadTouch, writeWhatsAppLeadTouch } = await import('@/lib/whatsapp/lead-feed');
  const supabase = createServiceRoleClient();

  const { data: msgs } = await supabase
    .from('pyra_whatsapp_messages')
    .select('message_id, lead_id, direction, agent_username, timestamp')
    .eq('instance_name', 'yellow')
    .not('lead_id', 'is', null);

  const rows = (msgs || []) as Array<{ message_id: string; lead_id: string; direction: 'incoming' | 'outgoing'; agent_username: string | null; timestamp: string }>;
  const leadIds = [...new Set(rows.map((m) => m.lead_id))];

  const { data: leads } = await supabase.from('pyra_sales_leads').select('id, assigned_to').in('id', leadIds);
  const owner = new Map((leads || []).map((l: { id: string; assigned_to: string | null }) => [l.id, l.assigned_to ?? null]));

  const { data: existing } = await supabase
    .from('pyra_lead_activities')
    .select('metadata')
    .in('lead_id', leadIds)
    .in('activity_type', ['whatsapp_inbound', 'whatsapp_outbound'])
    .in('metadata->>message_id', rows.map((m) => m.message_id));
  const logged = new Set(((existing || []) as Array<{ metadata: Record<string, unknown> | null }>).map((a) => a.metadata?.message_id as string | undefined).filter(Boolean));

  let written = 0;
  for (const m of rows) {
    const leadAssignedTo = owner.get(m.lead_id) ?? null;
    const inbound = m.direction === 'incoming';
    const creditAgent = inbound ? leadAssignedTo : (m.agent_username ?? null);
    if (creditAgent && shouldWriteLeadTouch({ leadId: m.lead_id, leadAssignedTo, creditAgent, alreadyLogged: logged.has(m.message_id), inbound })) {
      await writeWhatsAppLeadTouch(supabase, { leadId: m.lead_id, creditAgent, direction: m.direction, messageId: m.message_id, at: m.timestamp });
      written++;
    }
  }
  console.log(JSON.stringify({ candidates: rows.length, alreadyLogged: logged.size, written }));
}

main().catch((e) => { console.error('leadfeed backfill failed:', e); process.exit(1); });

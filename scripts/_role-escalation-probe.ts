#!/usr/bin/env tsx
/**
 * scripts/_role-escalation-probe.ts
 *
 * PROOF-OF-CONCEPT for the role-escalation path (audit 2026-08-08, migration 060).
 *
 * Migration 059 revoked writes on pyra_users, closing "PATCH my own row, set
 * role=admin". The same escalation was still reachable one table over:
 * `pyra_roles` granted `authenticated` full DML, and lib/auth/rbac.ts:911
 * returns the ['*'] superuser set when a role row contains '*'. So any logged-in
 * account could PATCH the role row it shares with its colleagues and become a
 * full admin in a single request.
 *
 * SAFETY — this probe never grants anyone anything:
 *   - It writes the role's EXISTING colour back to itself. Byte-identical value,
 *     so a success proves reach without changing a single meaningful field.
 *   - It NEVER touches `permissions`. Adding '*' would really promote
 *     youssef + cosette + test.sales for as long as the row stayed modified.
 *   - It re-reads and prints `permissions` afterwards so any drift is visible.
 *
 * Expected AFTER migration 060: HTTP 403, permission denied.
 *
 * Run:  npx tsx scripts/_role-escalation-probe.ts
 */
import { existsSync, readFileSync } from 'node:fs';

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnv('.env.local'), ...readEnv('.env.test.local') };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !ANON || !env.TEST_SALES_EMAIL) {
  throw new Error('Missing env (need NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + TEST_SALES_* )');
}

async function main() {
  const lr = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.TEST_SALES_EMAIL, password: env.TEST_SALES_PASSWORD }),
  });
  const { access_token: tok } = (await lr.json()) as { access_token?: string };
  if (!tok) {
    console.log('LOGIN FAILED');
    process.exit(1);
  }
  const H = { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  console.log('logged in as test.sales — a plain sales agent, no admin rights\n');

  // Read the shared role row.
  const cur = await fetch(`${URL}/rest/v1/pyra_roles?name=eq.Sales&select=id,color,permissions`, { headers: H });
  console.log(`READ  pyra_roles            -> HTTP ${cur.status}`);
  const rows = cur.ok ? await cur.json() : [];
  const row = rows[0];
  if (!row) {
    console.log('   (no "Sales" role visible — cannot probe further)');
    return;
  }
  const holders = await fetch(`${URL}/rest/v1/pyra_users?role_id=eq.${row.id}&select=username&status=eq.active`, { headers: H });
  const who = holders.ok ? (await holders.json()).map((u: { username: string }) => u.username) : [];
  console.log(`   role "Sales" is shared by: ${who.join(', ') || 'unknown'}`);
  console.log(`   permissions before: ${JSON.stringify(row.permissions)}\n`);

  // THE PROBE: same reach that setting permissions:['*'] would need.
  // Writes the existing colour back — no meaningful field is modified.
  const up = await fetch(`${URL}/rest/v1/pyra_roles?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ color: row.color }),
  });
  console.log(`WRITE pyra_roles (no-op colour) -> HTTP ${up.status}`);
  if (up.ok) {
    console.log('   ❌ ALLOWED — the same request with permissions:["*"] would make');
    console.log(`      ${who.join(' + ') || 'this agent'} full admins instantly.`);
  } else {
    console.log(`   ✅ BLOCKED: ${JSON.stringify(await up.json())}`);
  }

  // Confirm nothing drifted.
  const after = await fetch(`${URL}/rest/v1/pyra_roles?id=eq.${row.id}&select=permissions`, { headers: H });
  const [a] = after.ok ? await after.json() : [{}];
  const same = JSON.stringify(a?.permissions) === JSON.stringify(row.permissions);
  console.log(`\nintegrity check: permissions unchanged = ${same ? '✅ yes' : '❌ NO — INVESTIGATE'}`);
  console.log(`VERDICT: ${up.ok ? '❌ escalation path OPEN' : '✅ escalation path CLOSED'}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

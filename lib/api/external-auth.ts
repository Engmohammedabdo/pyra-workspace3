import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export interface ExternalApiContext {
  apiKey: {
    id: string;
    name: string;
    permissions: string[];
    created_by: string | null;
  };
}

/**
 * External API key authentication.
 *
 * Phase D Commit 4 (audit P2 #10) — constant-time comparison.
 *
 * Previous implementation used `.eq('key_hash', keyHash)` for lookup,
 * relying on Postgres equality which is NOT constant-time. The hash
 * digest leak is much less useful than a raw key (the key namespace
 * is the SHA-256 of a server-generated random — effectively
 * unsearchable), but Phase 14.3 #5 established `timingSafeEqual` as
 * the codebase standard for ANY secret comparison.
 *
 * New flow:
 *   1. Hash the user-provided key
 *   2. Fetch ALL active + non-expired API keys (small set — LOCK 4 cap
 *      is 1000 rows; currently <10 in production)
 *   3. Iterate with `timingSafeEqual` to find the matching hash
 *   4. The constant-time comparison neutralizes the timing leak
 *
 * Performance: SELECT scans up to 1000 rows. At <10 rows production
 * scale this is negligible. If the table ever grows beyond design
 * assumptions, this approach needs revisiting (e.g., bloom filter
 * pre-filter before the constant-time iteration). LOCK 4 documents
 * the limit explicitly.
 */
export async function getExternalAuth(req: NextRequest): Promise<ExternalApiContext | null> {
  const key = req.headers.get('x-api-key');
  if (!key) return null;

  const keyHashHex = crypto.createHash('sha256').update(key).digest('hex');
  const keyHashBuf = Buffer.from(keyHashHex, 'hex');

  const supabase = createServiceRoleClient();

  // LOCK 4 — fetch up to 1000 active, non-expired keys. The
  // pyra_api_keys table currently has fewer than 10 rows in production.
  // If you hit this limit, the table has grown beyond design assumptions
  // and the constant-time iteration approach should be revisited
  // (consider a Redis-backed lookup OR a 2-step pattern with a bloom
  // filter prefix index). `is_active = true` filter is index-served via
  // idx_api_keys_active.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('pyra_api_keys')
    .select('id, name, permissions, created_by, key_hash, expires_at, last_used_at')
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1000);

  if (error || !rows || rows.length === 0) return null;

  // Constant-time scan: timingSafeEqual on every row's hash.
  // We always iterate the full result set even after finding a match —
  // an attacker timing the response cannot tell which position in the
  // table matched (or if any matched at all).
  let matched: typeof rows[number] | null = null;
  for (const row of rows) {
    if (typeof row.key_hash !== 'string') continue;
    let rowHashBuf: Buffer;
    try {
      rowHashBuf = Buffer.from(row.key_hash, 'hex');
    } catch {
      continue;
    }
    // Length-guard MUST come before timingSafeEqual — the function
    // throws on unequal lengths, and the throw itself becomes a timing
    // oracle. Both sides should be 32 bytes (SHA-256 digest).
    if (
      rowHashBuf.length === keyHashBuf.length &&
      crypto.timingSafeEqual(rowHashBuf, keyHashBuf)
    ) {
      matched = row;
      // No `break` — continue iterating so attacker cannot time the
      // hit's position via response delay.
    }
  }

  if (!matched) return null;

  // Update last_used_at (fire-and-forget — never blocks the response)
  supabase
    .from('pyra_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', matched.id)
    .then(() => {});

  return {
    apiKey: {
      id: matched.id,
      name: matched.name,
      permissions: matched.permissions as string[],
      created_by: matched.created_by,
    },
  };
}

export function hasPermission(ctx: ExternalApiContext, permission: string): boolean {
  return ctx.apiKey.permissions.includes(permission) || ctx.apiKey.permissions.includes('*');
}

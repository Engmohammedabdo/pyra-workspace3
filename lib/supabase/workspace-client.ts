import { createClient } from '@supabase/supabase-js';

/**
 * Workspace storage client — used for reading project files from
 * Supabase Storage (e.g., Etmam video scripts).
 *
 * Uses the same Supabase instance but with the anon key (read-only
 * for public buckets / RLS-allowed paths).
 */
const WORKSPACE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const WORKSPACE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _client: ReturnType<typeof createClient> | null = null;

export function createWorkspaceClient() {
  if (_client) return _client;
  _client = createClient(WORKSPACE_URL, WORKSPACE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

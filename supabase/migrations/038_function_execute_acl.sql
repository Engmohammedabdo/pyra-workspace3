-- =============================================================
-- Migration 038: Lock down function EXECUTE privileges (Gap #3 follow-up)
-- =============================================================
-- Gap #3 Phase 0 revoked default privileges for TABLES and SEQUENCES from
-- `anon` -- but NOT for FUNCTIONS. Postgres grants EXECUTE to PUBLIC on every
-- new function by default, and Supabase additionally grants anon/authenticated.
-- Result: every function in `public` has been born internet-executable via the
-- anon key, which ships in the client bundle.
--
-- Found 2026-07-15 during the offboarding design research, which had considered
-- (and rejected) adding a SECURITY DEFINER `revoke_user_sessions(uuid)` -- it
-- would have inherited this same ACL and handed any anonymous caller an
-- auth-nuke primitive.
--
-- Current state (verified):
--   increment_share_access  SECURITY DEFINER, owner supabase_admin (superuser),
--                           acl: =X (PUBLIC) | anon=X | authenticated=X | service_role=X
--                           proconfig: null  (no search_path pinned)
--                           ONLY caller: app/api/shares/download/[token]/route.ts:105
--                           via createServiceRoleClient() -> only service_role is needed.
--   check_path_access       SECURITY INVOKER (runs as the caller -- no escalation),
--                           same over-broad acl.
--                           ONLY caller: lib/auth/permissions.ts via
--                           createServerSupabaseClient() -> authenticated is needed.
--
-- Risk tier: 2 (touches live privileges on live functions).
-- Forward-only (Phase 14.2).
-- =============================================================

-- 1. Harden increment_share_access: pin search_path + schema-qualify.
--    A SECURITY DEFINER function owned by a superuser with an unpinned
--    search_path is the classic privilege-escalation shape. CREATE OR REPLACE
--    preserves the existing ACL, so the REVOKEs below still apply after this.
CREATE OR REPLACE FUNCTION public.increment_share_access(link_id text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
BEGIN
  UPDATE public.pyra_share_links
  SET access_count = access_count + 1
  WHERE id = link_id;
END;
$function$;

-- 2. increment_share_access -> service_role ONLY.
--    Its single caller uses the service-role client; anon/authenticated/PUBLIC
--    were pure exposure with no consumer.
REVOKE ALL ON FUNCTION public.increment_share_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_share_access(text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_share_access(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_access(text) TO service_role;

-- 3. check_path_access -> authenticated + service_role.
--    SECURITY INVOKER, so an anon caller would execute it as anon and hit anon's
--    (already revoked) table grants -- but there is no reason for anon to hold it.
REVOKE ALL ON FUNCTION public.check_path_access(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_path_access(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_path_access(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_path_access(text, text, text) TO service_role;

-- 4. THE SYSTEMIC FIX -- stop the NEXT function being born exposed.
--    This is the half Gap #3 Phase 0 missed. Without it, every future
--    CREATE FUNCTION in `public` repeats the bug silently.
--
--    ALTER DEFAULT PRIVILEGES only affects objects created by the GRANTOR role,
--    so both creator identities must be covered -- pg_default_acl carries a
--    separate row per grantor. `supabase_admin` runs our migrations (pnpm
--    db:query); `postgres` is what the Supabase Studio SQL editor runs as.
--    Fixing only one leaves the other creating anon-executable functions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Verification (run after applying):
--   SELECT p.proname, p.prosecdef, p.proconfig,
--          coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC EXECUTE)') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('increment_share_access','check_path_access');
--   -- expect: no `=X` (PUBLIC) and no `anon=X` on either;
--   --         increment_share_access proconfig = {search_path=}
--   SELECT defaclobjtype, array_to_string(defaclacl, ' | ')
--     FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
--    WHERE n.nspname = 'public' AND d.defaclobjtype = 'f';
--   -- expect: no anon, no bare `=X`

-- -- DOWN (informational only):
-- -- GRANT EXECUTE ON FUNCTION public.increment_share_access(text) TO anon, authenticated;
-- -- GRANT EXECUTE ON FUNCTION public.check_path_access(text, text, text) TO anon;
-- -- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon;

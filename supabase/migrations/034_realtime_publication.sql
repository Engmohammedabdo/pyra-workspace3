-- 034_realtime_publication.sql
-- ROOT FIX: the supabase_realtime publication existed but published ZERO
-- tables since inception -- every postgres_changes subscription in the app
-- (notification bell, activity feed, files, projects) silently received
-- nothing and the UI fell back to 30s polling.
-- Publishes the two tables the dashboard actually subscribes to today:
--   pyra_notifications -> instant bell + chime (hooks/useRealtime.ts)
--   pyra_tasks         -> live board updates (added 2026-07-03)
-- INSERT/UPDATE/DELETE are already enabled on the publication.
-- Idempotent: guarded by pg_publication_tables checks.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pyra_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pyra_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pyra_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pyra_tasks;
  END IF;
END $$;

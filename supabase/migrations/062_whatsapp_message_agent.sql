-- ────────────────────────────────────────────────────────────────────────────
-- Migration 062 — Per-agent attribution column on WhatsApp messages
--
-- Phase:        WhatsApp analytics ("like calls") — Piece B
-- Author:       elharm
-- Date:         2026-08-20
-- Reversible:   YES (rollback hints inline below)
-- Touches data: NO (DDL only)
-- Risk tier:    1 (deterministic, no existing data touched)
--
-- Purpose:
--   Per-agent WhatsApp analytics need a credit key on each message, the way
--   pyra_agent_calls.agent_username stamps each call. WhatsApp has none: ~95% of
--   outgoing messages are typed on the phone (pulled fromMe) with no author, and
--   pyra_whatsapp_messages has no created_by/agent column. This adds a nullable
--   agent_username, stamped at write time on OUTGOING rows (colour line = the
--   holder; shared line = the conversation assignee; system-send = the actor) so
--   credit freezes to who owned the work then and a later reassignment / line
--   rotation cannot rewrite history. Inbound rows stay NULL (no author).
--
-- Idempotency contract:
--   ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS — safe to re-apply on a
--   fresh bootstrap and on live production. No data backfill.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] IF NOT EXISTS guards on every DDL statement
--   [x] No data backfill (Touches data = NO)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_whatsapp_messages
  ADD COLUMN IF NOT EXISTS agent_username varchar NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_agent
  ON pyra_whatsapp_messages (agent_username)
  WHERE agent_username IS NOT NULL;


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- -- DROP INDEX IF EXISTS idx_wa_messages_agent;
-- -- ALTER TABLE pyra_whatsapp_messages DROP COLUMN IF EXISTS agent_username;

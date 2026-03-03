-- Client Management Overhaul - Database Migrations
-- Run this in Supabase SQL Editor

-- 1. Add new columns to pyra_clients
ALTER TABLE pyra_clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE pyra_clients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- 2. Create client notes table
CREATE TABLE IF NOT EXISTS pyra_client_notes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES pyra_clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_notes_client ON pyra_client_notes(client_id);

-- 3. Create client tags table
CREATE TABLE IF NOT EXISTS pyra_client_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_tags_name ON pyra_client_tags(name);

-- 4. Create tag assignments junction table
CREATE TABLE IF NOT EXISTS pyra_client_tag_assignments (
  client_id TEXT NOT NULL REFERENCES pyra_clients(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES pyra_client_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, tag_id)
);

-- 5. Enable RLS (match existing pyra_* table pattern - service role bypasses RLS)
ALTER TABLE pyra_client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE pyra_client_tag_assignments ENABLE ROW LEVEL SECURITY;

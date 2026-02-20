-- Script Reviews table for Etmam/Injazat script approval workflow
-- Each script file (version-level) gets one review record (upsert on filename)

CREATE TABLE IF NOT EXISTS pyra_script_reviews (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,        -- e.g. "video-01-intro-v3.md"
  video_number INTEGER NOT NULL,        -- extracted: 1
  version INTEGER NOT NULL,             -- extracted: 3
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revision_requested')),
  comment TEXT,                         -- client comment (required for revision_requested)
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_script_reviews_status ON pyra_script_reviews(status);
CREATE INDEX IF NOT EXISTS idx_script_reviews_video ON pyra_script_reviews(video_number);

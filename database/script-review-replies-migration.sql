-- Script Review Replies table for threaded conversation between admin and client
-- Each reply belongs to a script review (parent_id → pyra_script_reviews.id)

CREATE TABLE IF NOT EXISTS pyra_script_review_replies (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES pyra_script_reviews(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'client')),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups by review
CREATE INDEX IF NOT EXISTS idx_script_review_replies_review ON pyra_script_review_replies(review_id);

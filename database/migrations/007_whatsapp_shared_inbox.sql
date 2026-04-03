-- ============================================================
-- Migration 007: WhatsApp Shared Inbox (Chatwoot-style)
-- ============================================================
-- Converts from "agent per instance" to "shared inbox" model.
-- Single WhatsApp number (pyraai), admin distributes conversations.
-- ============================================================

-- 1. Conversations table (replaces in-memory grouping)
CREATE TABLE IF NOT EXISTS pyra_whatsapp_conversations (
  id varchar(30) PRIMARY KEY,
  remote_jid varchar NOT NULL,
  instance_name varchar NOT NULL DEFAULT 'pyraai',
  contact_name varchar,
  contact_phone varchar,
  lead_id varchar,
  client_id varchar,
  status varchar DEFAULT 'open',        -- open | pending | resolved
  priority varchar DEFAULT 'normal',    -- low | normal | high | urgent
  assigned_to varchar,                  -- agent username (NULL = unassigned)
  assigned_at timestamptz,
  assigned_by varchar,
  last_message text,
  last_message_at timestamptz,
  last_customer_message_at timestamptz,
  last_agent_message_at timestamptz,
  unread_count int DEFAULT 0,
  is_pinned bool DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(remote_jid, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON pyra_whatsapp_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON pyra_whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_conv_remote_jid ON pyra_whatsapp_conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON pyra_whatsapp_conversations(contact_phone);

-- 2. Internal notes (team collaboration, never sent to WhatsApp)
CREATE TABLE IF NOT EXISTS pyra_conversation_notes (
  id varchar(30) PRIMARY KEY,
  conversation_id varchar REFERENCES pyra_whatsapp_conversations(id) ON DELETE CASCADE,
  author_username varchar NOT NULL,
  author_display_name varchar,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_notes_conv ON pyra_conversation_notes(conversation_id);

-- 3. Add conversation_id to messages
ALTER TABLE pyra_whatsapp_messages ADD COLUMN IF NOT EXISTS conversation_id varchar;

-- 4. Data migration: create conversations from existing messages
INSERT INTO pyra_whatsapp_conversations (id, remote_jid, instance_name, contact_name, contact_phone, lead_id, client_id, status, last_message, last_message_at, unread_count, created_at)
SELECT
  'conv_' || substr(md5(m.remote_jid || COALESCE(m.instance_name, 'pyraai')), 1, 16),
  m.remote_jid,
  COALESCE(m.instance_name, 'pyraai'),
  m.contact_name,
  CASE
    WHEN m.metadata->>'phone' IS NOT NULL THEN m.metadata->>'phone'
    ELSE regexp_replace(m.remote_jid, '@.*', '')
  END,
  m.lead_id,
  m.client_id,
  'resolved',
  m.content,
  m.timestamp,
  0,
  MIN(m.timestamp) OVER (PARTITION BY m.remote_jid, COALESCE(m.instance_name, 'pyraai'))
FROM (
  SELECT DISTINCT ON (remote_jid, COALESCE(instance_name, 'pyraai'))
    remote_jid, instance_name, contact_name, lead_id, client_id, content, timestamp, metadata
  FROM pyra_whatsapp_messages
  ORDER BY remote_jid, COALESCE(instance_name, 'pyraai'), timestamp DESC
) m
ON CONFLICT (remote_jid, instance_name) DO NOTHING;

-- 5. Link messages to conversations
UPDATE pyra_whatsapp_messages m
SET conversation_id = c.id
FROM pyra_whatsapp_conversations c
WHERE m.remote_jid = c.remote_jid
  AND COALESCE(m.instance_name, 'pyraai') = c.instance_name
  AND m.conversation_id IS NULL;

-- 6. Merge duplicates (same phone, different JID format)
-- Keep the conversation with the most recent message, move messages from duplicates
-- This handles @lid vs @s.whatsapp.net for the same contact
WITH duplicates AS (
  SELECT contact_phone,
         array_agg(id ORDER BY last_message_at DESC NULLS LAST) as ids
  FROM pyra_whatsapp_conversations
  WHERE contact_phone IS NOT NULL AND contact_phone != ''
  GROUP BY contact_phone
  HAVING COUNT(*) > 1
)
UPDATE pyra_whatsapp_messages m
SET conversation_id = (SELECT ids[1] FROM duplicates d
                       WHERE d.contact_phone = (
                         SELECT contact_phone FROM pyra_whatsapp_conversations
                         WHERE id = m.conversation_id
                       ))
WHERE m.conversation_id IN (
  SELECT unnest(ids[2:]) FROM duplicates
);

-- Delete duplicate conversations (keep first = most recent)
DELETE FROM pyra_whatsapp_conversations
WHERE id IN (
  SELECT unnest(ids[2:])
  FROM (
    SELECT contact_phone,
           array_agg(id ORDER BY last_message_at DESC NULLS LAST) as ids
    FROM pyra_whatsapp_conversations
    WHERE contact_phone IS NOT NULL AND contact_phone != ''
    GROUP BY contact_phone
    HAVING COUNT(*) > 1
  ) dups
);

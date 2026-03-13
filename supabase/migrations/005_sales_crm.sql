-- =============================================
-- Migration 005: Sales & Call Center CRM Module
-- 10 new tables for sales pipeline, leads, WhatsApp integration, and quote approvals
-- =============================================

-- 1. Pipeline stages (configurable sales funnel)
CREATE TABLE IF NOT EXISTS pyra_sales_pipeline_stages (
  id            varchar PRIMARY KEY,
  name          text NOT NULL,
  name_ar       text NOT NULL,
  color         varchar DEFAULT 'blue',
  sort_order    int NOT NULL DEFAULT 0,
  is_default    bool DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- 2. Sales labels/tags
CREATE TABLE IF NOT EXISTS pyra_sales_labels (
  id            varchar PRIMARY KEY,
  name          text NOT NULL,
  name_ar       text,
  color         varchar DEFAULT 'gray',
  created_by    varchar,
  created_at    timestamptz DEFAULT now()
);

-- 3. Sales leads (potential clients)
CREATE TABLE IF NOT EXISTS pyra_sales_leads (
  id              varchar PRIMARY KEY,
  name            text NOT NULL,
  phone           text,
  email           text,
  company         text,
  source          varchar DEFAULT 'manual',
  stage_id        varchar REFERENCES pyra_sales_pipeline_stages(id),
  assigned_to     varchar,
  client_id       varchar REFERENCES pyra_clients(id),
  notes           text,
  priority        varchar DEFAULT 'medium',
  last_contact_at timestamptz,
  next_follow_up  timestamptz,
  converted_at    timestamptz,
  is_converted    bool DEFAULT false,
  created_by      varchar,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON pyra_sales_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_stage    ON pyra_sales_leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone    ON pyra_sales_leads(phone);

-- 4. Lead ↔ Label junction
CREATE TABLE IF NOT EXISTS pyra_lead_labels (
  lead_id   varchar REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  label_id  varchar REFERENCES pyra_sales_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (lead_id, label_id)
);

-- 5. Lead activity log
CREATE TABLE IF NOT EXISTS pyra_lead_activities (
  id              varchar PRIMARY KEY,
  lead_id         varchar REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  activity_type   varchar NOT NULL,
  description     text,
  metadata        jsonb,
  created_by      varchar,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON pyra_lead_activities(lead_id);

-- 6. Lead transfer history
CREATE TABLE IF NOT EXISTS pyra_lead_transfers (
  id            varchar PRIMARY KEY,
  lead_id       varchar REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  from_agent    varchar,
  to_agent      varchar,
  reason        text,
  created_by    varchar,
  created_at    timestamptz DEFAULT now()
);

-- 7. WhatsApp instances (Evolution API)
CREATE TABLE IF NOT EXISTS pyra_whatsapp_instances (
  id              varchar PRIMARY KEY,
  instance_name   varchar UNIQUE NOT NULL,
  agent_username  varchar,
  phone_number    varchar,
  status          varchar DEFAULT 'disconnected',
  api_key         varchar,
  created_by      varchar,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 8. WhatsApp messages (synced from Evolution API)
CREATE TABLE IF NOT EXISTS pyra_whatsapp_messages (
  id              varchar PRIMARY KEY,
  instance_name   varchar,
  remote_jid      varchar NOT NULL,
  lead_id         varchar REFERENCES pyra_sales_leads(id),
  client_id       varchar REFERENCES pyra_clients(id),
  message_id      varchar,
  direction       varchar NOT NULL,
  message_type    varchar DEFAULT 'text',
  content         text,
  media_url       text,
  file_name       text,
  status          varchar DEFAULT 'sent',
  timestamp       timestamptz NOT NULL,
  metadata        jsonb,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_messages_jid      ON pyra_whatsapp_messages(remote_jid);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lead     ON pyra_whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_instance ON pyra_whatsapp_messages(instance_name);

-- 9. Quote approval workflow
CREATE TABLE IF NOT EXISTS pyra_quote_approvals (
  id              varchar PRIMARY KEY,
  quote_id        text REFERENCES pyra_quotes(id) ON DELETE CASCADE,
  requested_by    varchar,
  approved_by     varchar,
  status          varchar DEFAULT 'pending',
  comments        text,
  requested_at    timestamptz DEFAULT now(),
  responded_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_quote_approvals_quote  ON pyra_quote_approvals(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_approvals_status ON pyra_quote_approvals(status);

-- 10. Sales follow-up reminders
CREATE TABLE IF NOT EXISTS pyra_sales_follow_ups (
  id              varchar PRIMARY KEY,
  lead_id         varchar REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  assigned_to     varchar,
  due_at          timestamptz NOT NULL,
  title           text,
  notes           text,
  status          varchar DEFAULT 'pending',
  completed_at    timestamptz,
  created_by      varchar,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned ON pyra_sales_follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due      ON pyra_sales_follow_ups(due_at);

-- Seed default pipeline stages
INSERT INTO pyra_sales_pipeline_stages (id, name, name_ar, color, sort_order, is_default) VALUES
  ('stage_new',         'New',             E'\u062C\u062F\u064A\u062F',                          'blue',   0, true),
  ('stage_contacted',   'Initial Contact', E'\u062A\u0648\u0627\u0635\u0644 \u0623\u0648\u0644\u064A', 'yellow', 1, false),
  ('stage_interested',  'Interested',      E'\u0645\u0647\u062A\u0645',                          'orange', 2, false),
  ('stage_quoted',      'Quote Sent',      E'\u0639\u0631\u0636 \u0645\u0642\u062F\u0645',       'purple', 3, false),
  ('stage_negotiation', 'Negotiation',     E'\u062A\u0641\u0627\u0648\u0636',                    'indigo', 4, false),
  ('stage_won',         'Won',             E'\u0641\u0627\u0632',                                'green',  5, false),
  ('stage_lost',        'Lost',            E'\u062E\u0633\u0631',                                'red',    6, false)
ON CONFLICT (id) DO UPDATE SET name_ar = EXCLUDED.name_ar;

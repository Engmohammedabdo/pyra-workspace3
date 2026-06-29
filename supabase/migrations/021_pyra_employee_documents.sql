-- ============================================================
-- 021_pyra_employee_documents.sql
-- Employee Documents Vault: configurable types + per-employee docs.
-- Additive, idempotent. Storage in the pyra-private bucket.
-- ============================================================

CREATE TABLE IF NOT EXISTS pyra_document_types (
  id              varchar(20) PRIMARY KEY,
  name            varchar(100) NOT NULL,
  name_ar         varchar(100) NOT NULL,
  requires_expiry boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pyra_employee_documents (
  id                   varchar(20) PRIMARY KEY,
  employee_username    varchar NOT NULL,
  type_id              varchar(20) NOT NULL REFERENCES pyra_document_types(id),
  label                text,
  storage_path         text NOT NULL,
  mime_type            varchar(100) NOT NULL,
  size_bytes           integer NOT NULL CHECK (size_bytes > 0),
  expiry_date          date,
  expiry_alert_30_sent boolean NOT NULL DEFAULT false,
  expiry_alert_7_sent  boolean NOT NULL DEFAULT false,
  uploaded_by          varchar NOT NULL,
  uploaded_at          timestamptz NOT NULL DEFAULT now(),
  notes                text,
  metadata             jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_emp_docs_user      ON pyra_employee_documents (employee_username, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_emp_docs_type      ON pyra_employee_documents (type_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_expiry    ON pyra_employee_documents (expiry_date)
  WHERE expiry_date IS NOT NULL AND (expiry_alert_30_sent = false OR expiry_alert_7_sent = false);

INSERT INTO pyra_document_types (id, name, name_ar, requires_expiry, sort_order) VALUES
  ('dt_contract',  'Employment Contract', 'عقد عمل',        false, 0),
  ('dt_eid',       'Emirates ID',         'هوية إماراتية',  true,  1),
  ('dt_passport',  'Passport',            'جواز سفر',       true,  2),
  ('dt_visa',      'Residence/Visa',      'إقامة · تأشيرة', true,  3),
  ('dt_cert',      'Certificate',         'شهادة',          false, 4),
  ('dt_other',     'Other',               'أخرى',           false, 5)
ON CONFLICT (id) DO NOTHING;

-- Verification:
--   SELECT count(*) FROM pyra_document_types;  -- expect >= 6
--   SELECT column_name FROM information_schema.columns WHERE table_name='pyra_employee_documents';

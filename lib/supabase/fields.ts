/**
 * Centralised Supabase `.select()` field lists.
 *
 * Keeping column lists in one place makes it easy to add / remove columns
 * without hunting for duplicates across route files.
 */

/** Columns returned for a single quote (used by list + detail endpoints). */
export const QUOTE_FIELDS = `
  id, quote_number, client_id, lead_id, project_name, status,
  estimate_date, expiry_date, currency, subtotal, tax_rate,
  tax_amount, total, notes, bank_details,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone, client_address,
  terms_conditions,
  signature_data, signed_by, signed_at, signed_ip,
  sent_at, viewed_at, created_by, created_at, updated_at
`;

/** Columns returned for a single invoice (used by list + detail endpoints). */
export const INVOICE_FIELDS = `
  id, invoice_number, quote_id, client_id, project_name, status,
  issue_date, due_date, currency, subtotal, tax_rate,
  tax_amount, total, amount_paid, amount_due, notes,
  terms_conditions, bank_details,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone, client_address,
  milestone_type, parent_invoice_id, contract_id,
  created_by, created_at, updated_at
`;

// ==========================================
// Finance Fields
// ==========================================

export const EXPENSE_CATEGORY_FIELDS = `
  id, name, name_ar, icon, color, is_default, sort_order, created_at
`;

export const EXPENSE_FIELDS = `
  id, category_id, project_id, subscription_id, description, amount, currency,
  vat_rate, vat_amount, expense_date, vendor, payment_method,
  receipt_url, notes, is_recurring, recurring_period,
  created_by, created_at, updated_at
`;

export const CARD_FIELDS = `
  id, card_name, bank_name, last_four, card_type,
  expiry_month, expiry_year, is_default, notes,
  created_at, updated_at
`;

export const SUBSCRIPTION_FIELDS = `
  id, name, provider, cost, currency, billing_cycle,
  next_renewal_date, card_id, category, status, url,
  notes, auto_renew, created_at, updated_at
`;

export const CONTRACT_FIELDS = `
  id, client_id, project_id, title, description,
  contract_type, total_value, currency, vat_rate,
  billing_structure, start_date, end_date, status,
  amount_billed, amount_collected, notes,
  retainer_amount, retainer_cycle, billing_day,
  created_by, created_at, updated_at
`;

export const CONTRACT_ITEM_FIELDS = `
  id, contract_id, parent_id, title, description,
  sort_order, created_at, updated_at
`;

export const MILESTONE_FIELDS = `
  id, contract_id, title, description, percentage,
  amount, due_date, status, invoice_id, sort_order,
  completed_at, created_at, updated_at
`;

export const RECURRING_INVOICE_FIELDS = `
  id, contract_id, client_id, title, items, currency,
  billing_cycle, next_generation_date, last_generated_at,
  status, auto_send, created_by, created_at, updated_at
`;

export const REVENUE_TARGET_FIELDS = `
  id, period_type, period_start, period_end,
  target_amount, currency, notes, created_by,
  created_at, updated_at
`;

export const STRIPE_PAYMENT_FIELDS = `
  id, invoice_id, stripe_session_id, stripe_payment_intent_id,
  amount, currency, status, client_id, metadata,
  created_at, updated_at
`;

export const API_KEY_FIELDS = `
  id, name, key_prefix, permissions, is_active,
  last_used_at, expires_at, created_by,
  created_at, updated_at
`;

// ============================================================
// Sales & Call Center CRM
// ============================================================

export const LEAD_FIELDS = `
  id, name, phone, email, company, source, stage_id, assigned_to,
  client_id, notes, priority, score, last_contact_at, next_follow_up,
  converted_at, is_converted, created_by, created_at, updated_at
`;

export const LEAD_ACTIVITY_FIELDS = `
  id, lead_id, activity_type, description, metadata, created_by, created_at
`;

export const FOLLOW_UP_FIELDS = `
  id, lead_id, assigned_to, due_at, title, notes, status,
  completed_at, created_by, created_at
`;

export const WA_INSTANCE_FIELDS = `
  id, instance_name, agent_username, phone_number, status,
  api_key, created_by, created_at, updated_at
`;

export const WA_MESSAGE_FIELDS = `
  id, instance_name, remote_jid, lead_id, client_id, message_id,
  direction, message_type, content, media_url, file_name,
  status, timestamp, metadata, created_at
`;

export const QUOTE_APPROVAL_FIELDS = `
  id, quote_id, requested_by, approved_by, status,
  comments, requested_at, responded_at
`;

export const PIPELINE_STAGE_FIELDS = `
  id, name, name_ar, color, sort_order, is_default, created_at
`;

export const SALES_LABEL_FIELDS = `
  id, name, name_ar, color, created_by, created_at
`;

export const WA_TEMPLATE_FIELDS = `
  id, title, content, category, shortcut, created_by, created_at
`;

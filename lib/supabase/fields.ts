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
  tax_amount, total, discount_type, discount_value, discount_amount,
  notes, bank_details,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone, client_address,
  terms_conditions,
  signature_data, signed_by, signed_at, signed_ip,
  parent_quote_id, version,
  entity_id, license_no,
  sent_at, viewed_at, created_by, created_at, updated_at
`;

/** Columns returned for a single invoice (used by list + detail endpoints). */
export const INVOICE_FIELDS = `
  id, invoice_number, quote_id, client_id, project_name, status,
  issue_date, due_date, currency, subtotal, tax_rate,
  tax_amount, total, amount_paid, amount_due, notes,
  discount_type, discount_value, discount_amount,
  early_payment_discount_percent, early_payment_discount_days,
  project_id,
  terms_conditions, bank_details,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone, client_address,
  milestone_type, parent_invoice_id, contract_id,
  display_client_name, entity_id, license_no,
  created_by, created_at, updated_at
`;

// ==========================================
// Finance Fields
// ==========================================

export const EXPENSE_CATEGORY_FIELDS = `
  id, name, name_ar, icon, color, is_default, sort_order, created_at
`;

export const EXPENSE_FIELDS = `
  id, category_id, project_id, subscription_id, supplier_id,
  payroll_run_id, purchase_order_id,
  description, amount, currency,
  vat_rate, vat_amount, expense_date, vendor, payment_method,
  receipt_url, notes, is_recurring, recurring_period,
  status, approved_by, approved_at, approval_notes, submitted_by,
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

// ==========================================
// Credit Notes
// ==========================================

export const CREDIT_NOTE_FIELDS = `
  id, credit_note_number, invoice_id, client_id, reason, status,
  issue_date, currency, subtotal, tax_rate, tax_amount, total,
  applied_amount, notes,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone,
  created_by, created_at, updated_at
`;

export const CREDIT_NOTE_ITEM_FIELDS = `
  id, credit_note_id, description, quantity, rate, amount, sort_order, created_at
`;

export const SUPPLIER_FIELDS = `
  id, name, company, email, phone, address, tax_number,
  payment_terms_days, currency, bank_name, bank_account, bank_iban,
  notes, is_active, created_by, created_at, updated_at
`;

export const PURCHASE_ORDER_FIELDS = `
  id, po_number, supplier_id, project_id, status,
  issue_date, expected_delivery_date, currency,
  subtotal, tax_rate, tax_amount, total, notes,
  supplier_name, supplier_company, supplier_email,
  created_by, created_at, updated_at
`;

export const PO_ITEM_FIELDS = `
  id, purchase_order_id, description, quantity, rate, amount, sort_order, created_at
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
  id, lead_id, quote_id, assigned_to, due_at, title, notes, status,
  completed_at, created_by, created_at
`;

export const WA_INSTANCE_FIELDS = `
  id, instance_name, agent_username, phone_number, status,
  api_key, webhook_url, last_connected_at, auto_sync,
  created_by, created_at, updated_at
`;

export const WA_MESSAGE_FIELDS = `
  id, instance_name, remote_jid, lead_id, client_id, message_id,
  direction, message_type, content, media_url, file_name,
  contact_name, status, timestamp, metadata, created_at
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

export const WA_CONVERSATION_FIELDS = `
  id, remote_jid, instance_name, contact_name, contact_phone,
  lead_id, client_id, status, priority, assigned_to,
  assigned_at, assigned_by, last_message, last_message_at,
  last_customer_message_at, last_agent_message_at,
  unread_count, is_pinned, created_at, updated_at,
  team_id, snoozed_until, is_muted,
  first_reply_at, waiting_since,
  custom_attributes, merged_into_id
`;

export const CONVERSATION_NOTE_FIELDS = `
  id, conversation_id, author_username, author_display_name,
  content, created_at
`;

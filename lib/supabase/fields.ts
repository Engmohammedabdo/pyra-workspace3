/**
 * Centralised Supabase `.select()` field lists.
 *
 * Keeping column lists in one place makes it easy to add / remove columns
 * without hunting for duplicates across route files.
 */

/** Columns returned for a single quote (used by list + detail endpoints). */
export const QUOTE_FIELDS = `
  id, quote_number, client_id, project_name, status,
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
  milestone_type, parent_invoice_id,
  created_by, created_at, updated_at
`;

// ==========================================
// Finance Fields
// ==========================================

export const EXPENSE_CATEGORY_FIELDS = `
  id, name, name_ar, icon, color, is_default, sort_order, created_at
`;

export const EXPENSE_FIELDS = `
  id, category_id, description, amount, currency,
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
  created_by, created_at, updated_at
`;

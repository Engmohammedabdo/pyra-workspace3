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

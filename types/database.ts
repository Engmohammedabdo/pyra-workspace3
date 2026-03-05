// types/database.ts — TypeScript interfaces for all 22+1 Pyra Workspace tables
// Matches PRD Section 12.4 and Section 2.3

// ==========================================
// Core Tables (14)
// ==========================================

export interface PyraUser {
  id: number;
  username: string;
  auth_user_id: string;
  role: string;
  role_id: string | null;
  display_name: string;
  permissions: UserPermissions;
  created_at: string;
  email?: string;
  // Employee classification
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'freelance' | 'intern';
  work_location?: 'remote' | 'onsite' | 'hybrid';
  payment_type?: 'monthly_salary' | 'hourly' | 'per_task' | 'commission';
  salary?: number;
  hourly_rate?: number;
  hire_date?: string;
  national_id?: string;
  bank_details?: { bank?: string; iban?: string; account_name?: string; account_no?: string };
  department?: string;
  // Manager hierarchy
  manager_username?: string | null;
  // Work schedule
  work_schedule_id?: string | null;
  // Extended profile fields
  phone?: string;
  job_title?: string;
  avatar_url?: string;
  bio?: string;
  status?: 'active' | 'inactive' | 'suspended';
  // Joined from pyra_roles
  role_name?: string;
  role_name_ar?: string;
  role_permissions?: string[];
  role_color?: string;
  role_icon?: string;
}

export interface PyraRole {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  color: string;
  icon: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  member_count?: number;
}

export interface UserPermissions {
  paths?: Record<string, 'browse' | 'upload' | 'full'>;
  per_folder?: Record<string, {
    can_upload?: boolean;
    can_delete?: boolean;
    can_rename?: boolean;
    can_share?: boolean;
  }>;
  allowed_paths?: string[];
  can_upload?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
}

export interface PyraReview {
  id: string;
  file_path: string;
  username: string;
  display_name: string;
  type: 'comment' | 'approval';
  text: string;
  resolved: boolean;
  parent_id: string | null;
  created_at: string;
}

export interface PyraTrash {
  id: string;
  original_path: string;
  trash_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  deleted_by: string;
  deleted_by_display: string;
  deleted_at: string;
  auto_purge_at: string;
}

export interface PyraActivityLog {
  id: string;
  action_type: string;
  username: string;
  display_name: string;
  target_path: string;
  details: Record<string, unknown> | null;
  ip_address: string;
  created_at: string;
}

export interface PyraNotification {
  id: string;
  recipient_username: string;
  type: string;
  title: string;
  message: string;
  source_username: string;
  source_display_name: string;
  target_path: string;
  is_read: boolean;
  created_at: string;
}

export interface PyraShareLink {
  id: string;
  file_path: string;
  token: string;
  created_by: string;
  created_by_display: string;
  expires_at: string | null;
  password_hash: string | null;
  max_downloads: number | null;
  download_count: number;
  is_active: boolean;
  created_at: string;
}

export interface PyraTeam {
  id: string;
  name: string;
  description: string | null;
  permissions: UserPermissions;
  created_by: string;
  created_at: string;
}

export interface PyraTeamMember {
  id: string;
  team_id: string;
  username: string;
  added_by: string;
  added_at: string;
}

/** @deprecated Legacy table — archived. File access controlled via team→project→storage_path chain + RBAC. */
export interface PyraFilePermission {
  id: string;
  file_path: string;
  target_type: 'user' | 'team';
  target_id: string;
  permissions: Record<string, boolean>;
  granted_by: string;
  expires_at: string | null;
  created_at: string;
}

export interface PyraFileVersion {
  id: string;
  file_path: string;
  version_path: string;
  version_number: number;
  file_size: number;
  mime_type: string;
  created_by: string;
  created_at: string;
}

export interface PyraFileIndex {
  id: string;
  file_path: string;
  file_name: string;
  file_name_lower: string;
  original_name: string | null;
  file_size: number;
  mime_type: string;
  is_folder: boolean;
  parent_path: string;
  indexed_at: string;
  search_vector?: unknown; // tsvector
}

export interface PyraSetting {
  id: number;
  key: string;
  value: string;
  team_id: string | null;
  updated_at: string;
}

export interface PyraSession {
  id: string;
  username: string;
  token: string;
  ip_address: string;
  user_agent: string;
  last_activity: string;
  created_at: string;
  expires_at: string;
}

export interface PyraLoginAttempt {
  id: number;
  username: string;
  ip_address: string;
  success: boolean;
  created_at: string;
}

// ==========================================
// Portal Tables (6)
// ==========================================

export interface PyraClient {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
  auth_user_id: string;
  last_login_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PyraProject {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  client_company: string;
  team_id: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  start_date: string | null;
  deadline: string | null;
  storage_path: string | null;
  cover_image: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PyraProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string;
  category: string | null;
  version: number;
  needs_approval: boolean;
  uploaded_by: string;
  created_at: string;
  client_visible: boolean;
}

export interface PyraFileApproval {
  id: string;
  file_id: string;
  client_id: string;
  status: 'pending' | 'approved' | 'revision_requested';
  comment: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface PyraClientComment {
  id: string;
  project_id: string;
  file_id: string | null;
  author_type: 'client' | 'team';
  author_id: string;
  author_name: string;
  text: string;
  mentions: string[];
  parent_id: string | null;
  attachments: string[];
  is_read_by_client: boolean;
  is_read_by_team: boolean;
  created_at: string;
}

export interface PyraClientNotification {
  id: string;
  client_id: string;
  type: string;
  title: string;
  message: string;
  target_project_id: string | null;
  target_file_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ==========================================
// Script Reviews (Etmam)
// ==========================================

export interface PyraScriptReview {
  id: string;
  filename: string;
  video_number: number;
  version: number;
  status: 'pending' | 'approved' | 'revision_requested';
  comment: string | null;
  client_id: string;
  client_name: string;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraScriptReviewReply {
  id: string;
  review_id: string;
  sender_type: 'admin' | 'client';
  sender_name: string;
  message: string;
  created_at: string;
}

// ==========================================
// Quote Tables (2)
// ==========================================

export interface PyraQuote {
  id: string;
  quote_number: string;
  team_id: string;
  client_id: string | null;
  project_name: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
  estimate_date: string;
  expiry_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  terms_conditions: TermCondition[];
  bank_details: BankDetails;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  signature_data: string | null;
  signed_by: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermCondition {
  text: string;
}

export interface BankDetails {
  bank: string;
  account_name: string;
  account_no: string;
  iban: string;
}

export interface PyraQuoteItem {
  id: string;
  quote_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

// ==========================================
// New Migration Table (1)
// ==========================================

export interface PyraAuthMapping {
  id: string;
  auth_user_id: string;
  pyra_username: string;
  created_at: string;
}

// ==========================================
// Invoice Tables (3)
// ==========================================

export interface PyraInvoice {
  id: string;
  invoice_number: string;
  quote_id: string | null;
  client_id: string | null;
  project_name: string | null;
  status: 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  notes: string | null;
  terms_conditions: TermCondition[];
  bank_details: BankDetails;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  milestone_type: 'booking_deposit' | 'initial_delivery' | 'final_delivery' | null;
  parent_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraInvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface PyraPayment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: 'bank_transfer' | 'cash' | 'cheque' | 'credit_card' | 'online' | 'other';
  reference: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
}

// ==========================================
// Knowledge Base Tables (2)
// ==========================================

export interface PyraKbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraKbArticle {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  is_public: boolean;
  sort_order: number;
  view_count: number;
  author: string | null;
  author_display_name: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Client Branding (1)
// ==========================================

export interface PyraClientBranding {
  id: string;
  client_id: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  company_name_display: string | null;
  login_background_url: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// Webhook Tables (2)
// ==========================================

export interface PyraWebhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraWebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown> | null;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  next_retry_at: string | null;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
}

// ==========================================
// Automation Tables (2)
// ==========================================

export interface PyraAutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  is_enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraAutomationLog {
  id: string;
  rule_id: string;
  rule_name: string | null;
  trigger_event: string | null;
  trigger_data: Record<string, unknown> | null;
  actions_executed: Array<{ type: string; success: boolean; error?: string }> | null;
  status: 'success' | 'partial_failure' | 'failed';
  error_message: string | null;
  executed_at: string;
}

// ==========================================
// Finance Tables (5)
// ==========================================

export interface PyraExpenseCategory {
  id: string;
  name: string;
  name_ar: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface PyraExpense {
  id: string;
  category_id: string | null;
  project_id: string | null;
  description: string | null;
  amount: number;
  currency: string;
  vat_rate: number;
  vat_amount: number;
  expense_date: string | null;
  vendor: string | null;
  payment_method: string | null;
  receipt_url: string | null;
  notes: string | null;
  is_recurring: boolean;
  recurring_period: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category_name?: string;
  category_name_ar?: string;
  category_color?: string;
  project_name?: string;
}

export interface PyraCard {
  id: string;
  card_name: string | null;
  bank_name: string | null;
  last_four: string | null;
  card_type: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  subscription_count?: number;
}

export interface PyraSubscription {
  id: string;
  name: string;
  provider: string | null;
  cost: number;
  currency: string;
  billing_cycle: string | null;
  next_renewal_date: string | null;
  card_id: string | null;
  category: string | null;
  status: string;
  url: string | null;
  notes: string | null;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
  // joined
  card_name?: string;
  card_last_four?: string;
}

export interface PyraContract {
  id: string;
  client_id: string | null;
  project_id: string | null;
  title: string | null;
  description: string | null;
  contract_type: string | null;
  total_value: number;
  currency: string;
  vat_rate: number;
  billing_structure: Record<string, unknown> | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  amount_billed: number;
  amount_collected: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  client_name?: string;
  client_company?: string;
  project_name?: string;
}

export interface PyraContractMilestone {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  percentage: number;
  amount: number;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'invoiced';
  invoice_id: string | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraRecurringInvoice {
  id: string;
  contract_id: string | null;
  client_id: string | null;
  title: string;
  items: Array<{ description: string; quantity: number; rate: number }>;
  currency: string;
  billing_cycle: string;
  next_generation_date: string;
  last_generated_at: string | null;
  status: 'active' | 'paused' | 'cancelled';
  auto_send: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  client_name?: string;
  client_company?: string;
  contract_title?: string;
}

export interface PyraRevenueTarget {
  id: string;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  target_amount: number;
  currency: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PyraStripePayment {
  id: string;
  invoice_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  client_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// External API Keys
// ==========================================

export interface PyraApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// API Types
// ==========================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ==========================================
// Supabase Storage Types
// ==========================================

export interface StorageFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: {
    eTag?: string;
    size?: number;
    mimetype?: string;
    cacheControl?: string;
    lastModified?: string;
    contentLength?: number;
    httpStatusCode?: number;
  } | null;
}

export interface FileListItem {
  name: string;
  path: string;
  isFolder: boolean;
  size: number;
  mimeType: string;
  updatedAt: string | null;
  originalName?: string;
}

// ==========================================
// ERP Feature Tables
// ==========================================

// Leave Types (dynamic, replaces hardcoded types)
export interface PyraLeaveType {
  id: string;
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  default_days: number;
  max_carry_over: number;
  requires_attachment: boolean;
  is_paid: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// Dynamic Leave Balances (v2)
export interface PyraLeaveBalanceV2 {
  id: string;
  username: string;
  year: number;
  leave_type_id: string;
  total_days: number;
  used_days: number;
  carried_over: number;
  // Joined
  leave_type?: PyraLeaveType;
}

// Work Schedules
export interface PyraWorkSchedule {
  id: string;
  name: string;
  name_ar: string;
  work_days: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  daily_hours: number;
  overtime_multiplier: number;
  weekend_multiplier: number;
  is_default: boolean;
  created_at: string;
}

// Attendance
export interface PyraAttendance {
  id: string;
  username: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'holiday' | 'weekend';
  notes: string | null;
  ip_address: string | null;
  created_at: string;
  // Joined
  display_name?: string;
}

// Timesheet Periods
export interface PyraTimesheetPeriod {
  id: string;
  username: string;
  period_type: 'weekly' | 'biweekly' | 'monthly';
  start_date: string;
  end_date: string;
  total_hours: number;
  status: 'open' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
}

// Employee Payments
export interface PyraEmployeePayment {
  id: string;
  username: string;
  source_type: 'task' | 'overtime' | 'bonus' | 'deduction';
  source_id: string | null;
  description: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'paid';
  payroll_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  // Joined
  display_name?: string;
}

// Payroll Runs
export interface PyraPayrollRun {
  id: string;
  month: number;
  year: number;
  status: 'draft' | 'calculated' | 'approved' | 'paid';
  total_amount: number;
  currency: string;
  employee_count: number;
  calculated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

// Payroll Items (per employee per run)
export interface PyraPayrollItem {
  id: string;
  payroll_id: string;
  username: string;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  deductions: number;
  deduction_details: Array<{ reason: string; amount: number }>;
  net_pay: number;
  status: 'pending' | 'approved' | 'paid';
  created_at: string;
  // Joined
  display_name?: string;
  department?: string;
}

// Evaluation Periods
export interface PyraEvaluationPeriod {
  id: string;
  name: string;
  name_ar: string;
  start_date: string;
  end_date: string;
  status: 'draft' | 'active' | 'closed';
  created_by: string;
  created_at: string;
}

// Evaluations
export interface PyraEvaluation {
  id: string;
  period_id: string;
  employee_username: string;
  evaluator_username: string;
  evaluation_type: 'manager' | 'self' | 'peer';
  overall_rating: number | null;
  status: 'draft' | 'submitted' | 'acknowledged';
  comments: string | null;
  strengths: string | null;
  improvements: string | null;
  submitted_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  // Joined
  employee_display_name?: string;
  evaluator_display_name?: string;
  period_name?: string;
  scores?: PyraEvaluationScore[];
}

// Evaluation Criteria
export interface PyraEvaluationCriteria {
  id: string;
  name: string;
  name_ar: string;
  description: string | null;
  weight: number;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

// Evaluation Scores
export interface PyraEvaluationScore {
  id: string;
  evaluation_id: string;
  criteria_id: string;
  score: number;
  comment: string | null;
  // Joined
  criteria_name?: string;
  criteria_name_ar?: string;
}

// KPI Targets
export interface PyraKpiTarget {
  id: string;
  username: string;
  period_id: string | null;
  title: string;
  target_value: number | null;
  actual_value: number;
  unit: string | null;
  status: 'active' | 'achieved' | 'missed';
  created_at: string;
}

// Content Pipeline
export interface PyraContentPipeline {
  id: string;
  project_id: string | null;
  title: string;
  content_type: 'video' | 'reel' | 'podcast' | 'article' | 'social_post';
  current_stage: string;
  assigned_to: string | null;
  script_review_id: string | null;
  deadline: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  project_name?: string;
  assigned_display_name?: string;
  stages?: PyraPipelineStage[];
}

// Pipeline Stages
export interface PyraPipelineStage {
  id: string;
  pipeline_id: string;
  stage: 'scripting' | 'review' | 'revision' | 'filming' | 'editing' | 'client_review' | 'delivery';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

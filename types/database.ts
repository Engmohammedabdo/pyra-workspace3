// types/database.ts — TypeScript interfaces for all 22+1 Pyra Workspace tables
// Matches PRD Section 12.4 and Section 2.3

// ==========================================
// Core Tables (14)
// ==========================================

export interface PyraUser {
  id: number;
  username: string;
  auth_user_id: string;
  role: 'admin' | 'employee';
  display_name: string;
  permissions: UserPermissions;
  created_at: string;
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

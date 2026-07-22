import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// ── Action type constants ────────────────────────────
export const ACTIVITY_ACTIONS = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  APPROVE: 'approve',
  REJECT: 'reject',
  SEND: 'send',
  UPLOAD: 'upload',
  DOWNLOAD: 'download',
  LOGIN: 'login',
  LOGOUT: 'logout',
} as const;

// ── Entity type constants ────────────────────────────
export const ENTITY_TYPES = {
  INVOICE: 'invoice',
  QUOTE: 'quote',
  CLIENT: 'client',
  PROJECT: 'project',
  FILE: 'file',
  EXPENSE: 'expense',
  CONTRACT: 'contract',
  LEAD: 'lead',
  USER: 'user',
  ROLE: 'role',
  PAYROLL: 'payroll',
  LEAVE: 'leave',
  BOARD: 'board',
  TASK: 'task',
  DOCUMENT: 'document',
  TIMESHEET: 'timesheet',
  ATTENDANCE: 'attendance',
  WORK_SCHEDULE: 'work_schedule',
  EMPLOYEE_PAYMENT: 'employee_payment',
  DEDUCTION: 'deduction',
  EVALUATION: 'evaluation',
  OFFBOARDING: 'offboarding',
} as const;

/**
 * Log an activity to `pyra_activity_log`.
 *
 * Fire-and-forget: does NOT block the caller, never throws.
 * Uses the service-role client to bypass RLS.
 *
 * @param username    - pyra_users.username of the actor
 * @param displayName - Human-readable name of the actor
 * @param actionType  - What happened (e.g. "invoice_created", or combine ACTIVITY_ACTIONS + ENTITY_TYPES)
 * @param targetPath  - Entity path or identifier (e.g. "/dashboard/invoices/inv_abc123")
 * @param details     - Optional JSON payload with extra context
 * @param ip          - Optional client IP address
 */
export function logActivity(
  username: string,
  displayName: string,
  actionType: string,
  targetPath: string,
  details?: Record<string, unknown>,
  ip?: string,
): void {
  const supabase = createServiceRoleClient();

  supabase
    .from('pyra_activity_log')
    .insert({
      id: generateId('al'),
      action_type: actionType,
      username,
      display_name: displayName,
      target_path: targetPath,
      details: details ?? {},
      ip_address: ip ?? '',
    })
    .then(({ error }) => {
      if (error) console.error('[logActivity] insert failed:', error.message);
    });
}

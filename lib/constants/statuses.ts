// ============================================================
// Centralized Status Constants — Single source of truth
// NEVER hardcode status strings. Import from here.
// ============================================================

// ── Invoice ──
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

export type InvoiceStatus = typeof INVOICE_STATUS[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'مسودة',
  sent: 'مرسلة',
  partially_paid: 'مدفوعة جزئياً',
  paid: 'مدفوعة',
  overdue: 'متأخرة',
  cancelled: 'ملغية',
};

export const INVOICE_PAID_STATUSES: InvoiceStatus[] = ['paid', 'partially_paid'];
export const INVOICE_OUTSTANDING_STATUSES: InvoiceStatus[] = ['sent', 'partially_paid', 'overdue'];
export const INVOICE_EDITABLE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'overdue'];

// ── Quote ──
export const QUOTE_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  SENT: 'sent',
  VIEWED: 'viewed',
  SIGNED: 'signed',
  INVOICED: 'invoiced',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type QuoteStatus = typeof QUOTE_STATUS[keyof typeof QUOTE_STATUS];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  sent: 'مرسل',
  viewed: 'تم العرض',
  signed: 'موقّع',
  invoiced: 'تم الفوترة',
  rejected: 'مرفوض',
  expired: 'منتهي',
  cancelled: 'ملغي',
};

export const QUOTE_VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  pending_approval: ['draft', 'sent', 'rejected'],
  sent: ['draft', 'viewed', 'cancelled'],
  viewed: ['draft', 'signed', 'cancelled'],
  signed: ['invoiced'],
  invoiced: [],
  rejected: ['draft'],
  expired: ['draft'],
  cancelled: ['draft'],
};

// ── Contract ──
export const CONTRACT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type ContractStatus = typeof CONTRACT_STATUS[keyof typeof CONTRACT_STATUS];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'مسودة',
  active: 'نشط',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

// ── Expense ──
export const EXPENSE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ExpenseStatus = typeof EXPENSE_STATUS[keyof typeof EXPENSE_STATUS];

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

// ── Leave ──
export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type LeaveStatus = typeof LEAVE_STATUS[keyof typeof LEAVE_STATUS];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
};

// ── Payroll ──
export const PAYROLL_STATUS = {
  DRAFT: 'draft',
  CALCULATED: 'calculated',
  APPROVED: 'approved',
  PAID: 'paid',
} as const;

export type PayrollStatus = typeof PAYROLL_STATUS[keyof typeof PAYROLL_STATUS];

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: 'مسودة',
  calculated: 'محسوب',
  approved: 'معتمد',
  paid: 'مدفوع',
};

// ── Purchase Order ──
export const PO_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACKNOWLEDGED: 'acknowledged',
  RECEIVED: 'received',
  INVOICED: 'invoiced',
  CANCELLED: 'cancelled',
} as const;

export type POStatus = typeof PO_STATUS[keyof typeof PO_STATUS];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'مسودة',
  sent: 'مرسل',
  acknowledged: 'تم الاستلام',
  received: 'تم التوريد',
  invoiced: 'تم الفوترة',
  cancelled: 'ملغي',
};

export const PO_VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['acknowledged', 'cancelled'],
  acknowledged: ['received', 'cancelled'],
  received: ['invoiced'],
  invoiced: [],
  cancelled: [],
};

// ── Credit Note ──
export const CREDIT_NOTE_STATUS = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  APPLIED: 'applied',
  CANCELLED: 'cancelled',
} as const;

export type CreditNoteStatus = typeof CREDIT_NOTE_STATUS[keyof typeof CREDIT_NOTE_STATUS];

export const CREDIT_NOTE_STATUS_LABELS: Record<CreditNoteStatus, string> = {
  draft: 'مسودة',
  issued: 'صادر',
  applied: 'مطبّق',
  cancelled: 'ملغي',
};

// ── Subscription ──
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'نشط',
  cancelled: 'ملغي',
  expired: 'منتهي',
};

// ── Timesheet ──
export const TIMESHEET_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type TimesheetStatus = typeof TIMESHEET_STATUS[keyof typeof TIMESHEET_STATUS];

// ── File Approval ──
export const FILE_APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REVISION_REQUESTED: 'revision_requested',
} as const;

export type FileApprovalStatus = typeof FILE_APPROVAL_STATUS[keyof typeof FILE_APPROVAL_STATUS];

// ── Payment Methods ──
export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  CHEQUE: 'cheque',
  CREDIT_CARD: 'credit_card',
  ONLINE: 'online',
  STRIPE: 'stripe',
  CREDIT_NOTE: 'credit_note',
  REFUND: 'refund',
  OTHER: 'other',
} as const;

export type PaymentMethod = typeof PAYMENT_METHOD[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  credit_card: 'بطاقة ائتمان',
  online: 'دفع إلكتروني',
  stripe: 'Stripe',
  credit_note: 'إشعار دائن (رد)',
  refund: 'استرداد',
  other: 'أخرى',
};

// ── Billing Cycles ──
export const BILLING_CYCLE = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
} as const;

export type BillingCycle = typeof BILLING_CYCLE[keyof typeof BILLING_CYCLE];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'أسبوعي',
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
};

// ── Employee Payment ──
export const EMPLOYEE_PAYMENT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PAID: 'paid',
  REJECTED: 'rejected',
} as const;

export type EmployeePaymentStatus = typeof EMPLOYEE_PAYMENT_STATUS[keyof typeof EMPLOYEE_PAYMENT_STATUS];

export const EMPLOYEE_PAYMENT_STATUS_LABELS: Record<EmployeePaymentStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'معتمد',
  paid: 'مدفوع',
  rejected: 'مرفوض',
};

// ── Evaluation ──
export const EVALUATION_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type EvaluationStatus = typeof EVALUATION_STATUS[keyof typeof EVALUATION_STATUS];

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  draft: 'مسودة',
  in_progress: 'جاري التقييم',
  completed: 'مكتمل',
};

// ── Content Pipeline ──
export const CONTENT_PIPELINE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
} as const;

export type ContentPipelineStatus = typeof CONTENT_PIPELINE_STATUS[keyof typeof CONTENT_PIPELINE_STATUS];

export const CONTENT_PIPELINE_STATUS_LABELS: Record<ContentPipelineStatus, string> = {
  pending: 'بانتظار البدء',
  in_progress: 'قيد التنفيذ',
  review: 'قيد المراجعة',
  approved: 'معتمد',
  published: 'منشور',
};

// ── Follow-Up ──
export const FOLLOW_UP_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

export type FollowUpStatus = typeof FOLLOW_UP_STATUS[keyof typeof FOLLOW_UP_STATUS];

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  pending: 'بانتظار التنفيذ',
  completed: 'مكتمل',
  overdue: 'متأخر',
  cancelled: 'ملغي',
};

// ── Client ──
export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type ClientStatus = typeof CLIENT_STATUS[keyof typeof CLIENT_STATUS];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
};

// ── Lead (legacy LEAD_STATUS — pre-CRM-rebuild) ──
// Kept for any old code paths still importing it. New CRM code should use
// the PIPELINE_STAGE_IDS / pipeline_stages table below.
export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
} as const;

export type LeadStatus = typeof LEAD_STATUS[keyof typeof LEAD_STATUS];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  qualified: 'مؤهل',
  proposal: 'عرض سعر',
  negotiation: 'تفاوض',
  won: 'تم الكسب',
  lost: 'خسارة',
};

// ── CRM Pipeline Stages (post-rebuild — CRM-PRD/01-OVERVIEW-AND-SCOPE.md) ──
//
// IDs match the rows seeded by supabase/migrations/007_crm_pipeline_stages.sql.
// Stage 5 (`contract_signed`) is a transit stage — leads parked here are
// awaiting Manager approval before becoming `closed_won`.
export const PIPELINE_STAGE_IDS = {
  NEW_INQUIRY:     'stg_new_inquiry',
  DISCOVERY_CALL:  'stg_discovery_call',
  PROPOSAL_SENT:   'stg_proposal_sent',
  NEGOTIATION:     'stg_negotiation',
  CONTRACT_SIGNED: 'stg_contract_signed',
  CLOSED_WON:      'stg_closed_won',
  CLOSED_LOST:     'stg_closed_lost',
} as const;

export type PipelineStageId = typeof PIPELINE_STAGE_IDS[keyof typeof PIPELINE_STAGE_IDS];

export const PIPELINE_STAGE_LABELS_AR: Record<PipelineStageId, string> = {
  stg_new_inquiry:     'استفسار جديد',
  stg_discovery_call:  'مكالمة استكشافية',
  stg_proposal_sent:   'تم إرسال العرض',
  stg_negotiation:     'تفاوض',
  stg_contract_signed: 'تم توقيع العقد',
  stg_closed_won:      'فوز بالصفقة',
  stg_closed_lost:     'خسارة',
};

export const PIPELINE_STAGE_ORDER: PipelineStageId[] = [
  'stg_new_inquiry',
  'stg_discovery_call',
  'stg_proposal_sent',
  'stg_negotiation',
  'stg_contract_signed',
  'stg_closed_won',
  'stg_closed_lost',
];

/**
 * Hybrid win-probability defaults per Q-BIZ-001.
 * Applied automatically on stage change UNLESS the lead's
 * `win_probability_overridden = true`.
 */
export const STAGE_DEFAULT_WIN_PROBABILITY: Record<PipelineStageId, number> = {
  stg_new_inquiry:     10,
  stg_discovery_call:  25,
  stg_proposal_sent:   50,
  stg_negotiation:     72,
  stg_contract_signed: 95,
  stg_closed_won:      100,
  stg_closed_lost:     0,
};

/** Stages where the lead is "in pipeline" (not yet finalised). */
export const PIPELINE_ACTIVE_STAGES: PipelineStageId[] = [
  'stg_new_inquiry',
  'stg_discovery_call',
  'stg_proposal_sent',
  'stg_negotiation',
  'stg_contract_signed',
];

/** Terminal stages — lead is finalised. */
export const PIPELINE_FINAL_STAGES: PipelineStageId[] = [
  'stg_closed_won',
  'stg_closed_lost',
];

// ── CRM Lead Type ──
export const LEAD_TYPE = {
  B2B: 'b2b',
  B2C: 'b2c',
} as const;

export type LeadType = typeof LEAD_TYPE[keyof typeof LEAD_TYPE];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  b2b: 'شركة (B2B)',
  b2c: 'فرد (B2C)',
};

// ── CRM Deal Type (the service Pyramedia would deliver) ──
export const LEAD_DEAL_TYPE = {
  WEB_DESIGN:            'web_design',
  SOCIAL_MEDIA_RETAINER: 'social_media_retainer',
  BRANDING:              'branding',
  PAYER_AI:              'payer_ai',
  VIDEO_PRODUCTION:      'video_production',
  PERFORMANCE_ADS:       'performance_ads',
  HYBRID_PACKAGE:        'hybrid_package',
  OTHER:                 'other',
} as const;

export type LeadDealType = typeof LEAD_DEAL_TYPE[keyof typeof LEAD_DEAL_TYPE];

export const LEAD_DEAL_TYPE_LABELS: Record<LeadDealType, string> = {
  web_design:            'تصميم موقع',
  social_media_retainer: 'إدارة سوشيال (Retainer)',
  branding:              'هوية بصرية',
  payer_ai:              'Payer AI',
  video_production:      'إنتاج فيديو',
  performance_ads:       'حملات إعلانية',
  hybrid_package:        'باقة مدمجة',
  other:                 'غير ذلك',
};

// ── CRM Lead Billing Cycle (separate from the global BILLING_CYCLE — leads
//    can be one-time deals, which doesn't apply to recurring contracts) ──
export const LEAD_BILLING_CYCLE = {
  ONE_TIME:  'one_time',
  MONTHLY:   'monthly',
  QUARTERLY: 'quarterly',
  ANNUAL:    'annual',
} as const;

export type LeadBillingCycle = typeof LEAD_BILLING_CYCLE[keyof typeof LEAD_BILLING_CYCLE];

export const LEAD_BILLING_CYCLE_LABELS: Record<LeadBillingCycle, string> = {
  one_time:  'مرة واحدة',
  monthly:   'شهري',
  quarterly: 'ربع سنوي',
  annual:    'سنوي',
};

// ── CRM Lead Activity Types (timeline events) ──
//
// Authoritative TypeScript union — DB does NOT enforce a CHECK constraint
// on `pyra_lead_activities.activity_type` because that would break legacy
// rows. New activities written by application code MUST use one of these.
//
// Reference: CRM-PRD/02-DATABASE-AND-MIGRATION.md § Phase 6.
export const LEAD_ACTIVITY_TYPES = [
  'lead_created',
  'stage_change',
  'note',
  'call_logged',
  'meeting_scheduled',
  'whatsapp_inbound',
  'whatsapp_outbound',
  'email_sent',
  'file_attached',
  'field_updated',
  'assignment_changed',
  'closed_won_pending',
  'closed_won_approved',
  'closed_won_rejected',
  'follow_up_created',
  'follow_up_completed',
  'follow_up_overdue',
  'idle_warning',
] as const;

export type LeadActivityTypeNew = typeof LEAD_ACTIVITY_TYPES[number];

export const LEAD_ACTIVITY_LABELS_AR: Record<LeadActivityTypeNew, string> = {
  lead_created:        'تم إنشاء الـ Lead',
  stage_change:        'انتقلت المرحلة',
  note:                'ملاحظة',
  call_logged:         'تم تسجيل مكالمة',
  meeting_scheduled:   'اجتماع محدد',
  whatsapp_inbound:    'رسالة واتساب واردة',
  whatsapp_outbound:   'رسالة واتساب صادرة',
  email_sent:          'تم إرسال إيميل',
  file_attached:       'تم إرفاق ملف',
  field_updated:       'تحديث حقل',
  assignment_changed:  'تغيير المسؤول',
  closed_won_pending:  'بانتظار اعتماد Closed Won',
  closed_won_approved: 'تم اعتماد Closed Won',
  closed_won_rejected: 'تم رفض Closed Won',
  follow_up_created:   'متابعة جديدة',
  follow_up_completed: 'تم تنفيذ المتابعة',
  follow_up_overdue:   'متابعة متأخرة',
  idle_warning:        'تنبيه — Lead بدون نشاط',
};

// ── Conversation (WhatsApp Shared Inbox) ──
export const CONVERSATION_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  RESOLVED: 'resolved',
} as const;

export type ConversationStatus = typeof CONVERSATION_STATUS[keyof typeof CONVERSATION_STATUS];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  open: 'مفتوحة',
  pending: 'بانتظار الرد',
  resolved: 'محلولة',
};

export const CONVERSATION_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type ConversationPriority = typeof CONVERSATION_PRIORITY[keyof typeof CONVERSATION_PRIORITY];

export const CONVERSATION_PRIORITY_LABELS: Record<ConversationPriority, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
  urgent: 'عاجلة',
};

// ── Lead Tasks (Phase 15.1 Commit 2) ──
// Per-lead tasks live in pyra_lead_tasks (independent from pyra_tasks/board
// tasks). Status ordering for list sort matches the API CASE statement:
//   pending(0) < in_progress(1) < completed(2) < cancelled(3)
export const LEAD_TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type LeadTaskStatus = typeof LEAD_TASK_STATUS[keyof typeof LEAD_TASK_STATUS];

export const LEAD_TASK_STATUS_LABELS_AR: Record<LeadTaskStatus, string> = {
  pending: 'معلّقة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  cancelled: 'ملغية',
};

export const LEAD_TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type LeadTaskPriority = typeof LEAD_TASK_PRIORITY[keyof typeof LEAD_TASK_PRIORITY];

export const LEAD_TASK_PRIORITY_LABELS_AR: Record<LeadTaskPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

/**
 * Title length cap shared by POST + PATCH on `/api/crm/leads/[id]/tasks/*`.
 * Mirror in DB CHECK (`length(title) > 0`) is the lower-bound contract; this
 * is the upper-bound contract enforced API-side BEFORE the DB roundtrip so
 * the user gets a friendly Arabic message instead of a raw constraint error.
 * Phase 14.3 #5 — single source of truth (Reviewer L1 fix).
 */
export const LEAD_TASK_TITLE_MAX = 200;

// ── Calendar Events (Phase 15.1 Commit 4) ──
// Unified feed over 3 sources: lead_tasks, lead_follow_ups, meeting_activities.
// See app/api/calendar/events/route.ts for the API contract.
export const CALENDAR_EVENT_SOURCE = {
  TASK: 'task',
  FOLLOW_UP: 'follow_up',
  MEETING: 'meeting',
} as const;

export type CalendarEventSource = typeof CALENDAR_EVENT_SOURCE[keyof typeof CALENDAR_EVENT_SOURCE];

export const CALENDAR_EVENT_SOURCE_LABELS_AR: Record<CalendarEventSource, string> = {
  task: 'مهمة',
  follow_up: 'متابعة',
  meeting: 'اجتماع',
};

/**
 * Per-source visual tone for calendar UI (Commit 5).
 * Lead tasks → orange (matches CRM brand)
 * Follow-ups → blue (matches existing follow-up surfaces)
 * Meetings → purple (distinct from both above)
 */
export const CALENDAR_EVENT_TONES: Record<CalendarEventSource, string> = {
  task:      'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/40',
  follow_up: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
  meeting:   'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40',
};

/**
 * Maximum calendar query window in days. Prevents accidental
 * "give me 5 years of events" → 100k row scan.
 * v1.1 may raise to 366 (full year) if the agenda view demands it.
 */
export const CALENDAR_MAX_WINDOW_DAYS = 62;

/**
 * Hardcoded application timezone for date-only → datetime conversion
 * (lead task `due_date` is a DATE column with no time component; we
 * project it to midnight in this TZ for calendar placement).
 *
 * Asia/Dubai = UTC+4, no DST. v1.1 backlog: env-driven if Pyramedia
 * expands beyond GCC. See `Asia/Dubai` precedent in lead-idle-check
 * cron (CLAUDE.md Phase 11 decision 6).
 */
export const CALENDAR_TIMEZONE = 'Asia/Dubai';
export const CALENDAR_TIMEZONE_OFFSET = '+04:00';

// ── Attendance ──
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  HOLIDAY: 'holiday',
  WEEKEND: 'weekend',
} as const;

export type AttendanceStatus = typeof ATTENDANCE_STATUS[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  early_leave: 'انصراف مبكر',
  holiday: 'إجازة رسمية',
  weekend: 'عطلة',
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-green-500/10 text-green-600 dark:text-green-400',
  absent: 'bg-red-500/10 text-red-600 dark:text-red-400',
  late: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  early_leave: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  holiday: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  weekend: 'bg-gray-500/10 text-gray-500 dark:text-gray-400',
};

// ── Currencies ──
export const CURRENCIES = [
  { value: 'AED', label: 'AED — درهم إماراتي' },
  { value: 'USD', label: 'USD — دولار أمريكي' },
  { value: 'EUR', label: 'EUR — يورو' },
  { value: 'SAR', label: 'SAR — ريال سعودي' },
  { value: 'GBP', label: 'GBP — جنيه إسترليني' },
] as const;

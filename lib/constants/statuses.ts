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

// ── Currencies ──
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

// ── Currencies ──
export const CURRENCIES = [
  { value: 'AED', label: 'AED — درهم إماراتي' },
  { value: 'USD', label: 'USD — دولار أمريكي' },
  { value: 'EUR', label: 'EUR — يورو' },
  { value: 'SAR', label: 'SAR — ريال سعودي' },
  { value: 'GBP', label: 'GBP — جنيه إسترليني' },
] as const;

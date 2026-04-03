export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  conditions: ConditionRow[];
  actions: ActionRow[];
}

export interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

export interface ActionRow {
  type: string;
  config: Record<string, unknown>;
}

export const TRIGGER_LABELS: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  project_status_changed: 'تغيير حالة مشروع',
  quote_signed: 'توقيع عرض سعر',
  invoice_overdue: 'فاتورة متأخرة',
  client_comment: 'تعليق عميل',
  approval_status_changed: 'تغيير حالة موافقة',
  invoice_paid: 'دفع فاتورة',
  project_created: 'إنشاء مشروع',
  client_created: 'إنشاء عميل',
};

export const ACTION_TYPES: Record<string, string> = {
  create_notification: 'إنشاء إشعار',
  change_project_status: 'تغيير حالة مشروع',
  create_invoice: 'إنشاء فاتورة',
  log_activity: 'تسجيل نشاط',
  send_email: 'إرسال بريد إلكتروني',
  fire_webhook: 'تشغيل Webhook',
};

export const CONDITION_OPERATORS: Record<string, string> = {
  equals: 'يساوي',
  not_equals: 'لا يساوي',
  contains: 'يحتوي',
  starts_with: 'يبدأ بـ',
  greater_than: 'أكبر من',
  less_than: 'أقل من',
  is_empty: 'فارغ',
  is_not_empty: 'غير فارغ',
};

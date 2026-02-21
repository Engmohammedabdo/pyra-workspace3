export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'tpl_file_upload_notify',
    name: '\u0625\u0634\u0639\u0627\u0631 \u0631\u0641\u0639 \u0645\u0644\u0641',
    description: '\u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 \u0644\u0644\u0645\u0634\u0631\u0641 \u0639\u0646\u062F \u0631\u0641\u0639 \u0645\u0644\u0641 \u062C\u062F\u064A\u062F',
    trigger_event: 'file_uploaded',
    conditions: [],
    actions: [
      {
        type: 'create_notification',
        config: {
          recipient: 'admin',
          notification_type: 'file_upload',
          title: '\u0645\u0644\u0641 \u062C\u062F\u064A\u062F: {{file_name}}',
          message: '\u0642\u0627\u0645 {{display_name}} \u0628\u0631\u0641\u0639 \u0645\u0644\u0641 {{file_name}}',
        },
      },
    ],
  },
  {
    id: 'tpl_overdue_reminder',
    name: '\u062A\u0630\u0643\u064A\u0631 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u062A\u0623\u062E\u0631\u0629',
    description: '\u0625\u0646\u0634\u0627\u0621 \u0625\u0634\u0639\u0627\u0631 \u0639\u0646\u062F \u062A\u0623\u062E\u0631 \u0641\u0627\u062A\u0648\u0631\u0629 \u0639\u0646 \u0645\u0648\u0639\u062F \u0627\u0644\u0633\u062F\u0627\u062F',
    trigger_event: 'invoice_overdue',
    conditions: [],
    actions: [
      {
        type: 'create_notification',
        config: {
          recipient: 'admin',
          notification_type: 'invoice_overdue',
          title: '\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u062A\u0623\u062E\u0631\u0629: {{invoice_number}}',
          message:
            '\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 {{invoice_number}} \u0644\u0644\u0639\u0645\u064A\u0644 {{client_name}} \u0645\u062A\u0623\u062E\u0631\u0629 \u0639\u0646 \u0627\u0644\u0633\u062F\u0627\u062F',
        },
      },
    ],
  },
  {
    id: 'tpl_quote_to_invoice',
    name: '\u0625\u0634\u0639\u0627\u0631 \u062A\u0648\u0642\u064A\u0639 \u0639\u0631\u0636 \u0633\u0639\u0631',
    description: '\u0625\u0634\u0639\u0627\u0631 \u0627\u0644\u0641\u0631\u064A\u0642 \u0639\u0646\u062F \u062A\u0648\u0642\u064A\u0639 \u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u0646 \u0627\u0644\u0639\u0645\u064A\u0644',
    trigger_event: 'quote_signed',
    conditions: [],
    actions: [
      {
        type: 'create_notification',
        config: {
          recipient: 'admin',
          notification_type: 'quote_signed',
          title: '\u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u0648\u0642\u0639: {{quote_number}}',
          message:
            '\u0642\u0627\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 {{client_name}} \u0628\u062A\u0648\u0642\u064A\u0639 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 {{quote_number}}',
        },
      },
      {
        type: 'log_activity',
        config: {
          action_type: 'quote_signed_automation',
          message: '\u062A\u0645 \u062A\u0648\u0642\u064A\u0639 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 - \u064A\u0645\u0643\u0646 \u0625\u0646\u0634\u0627\u0621 \u0641\u0627\u062A\u0648\u0631\u0629',
        },
      },
    ],
  },
];

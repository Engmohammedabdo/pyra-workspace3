// Line (Evolution instance) display helpers for the multi-number inbox.
//
// 'pyraai' is the company's main number and reads as «الشركة»; any other line
// shows its own name (e.g. `selver`). Kept as ONE tiny module so the filter
// bar, the conversation-list badge, and the chat header can never disagree
// about what a line is called.
//
// i18n-exempt: the sales chat surface is Phase 6e (not yet migrated) — Arabic
// literals are still the norm here, same as the rest of components/sales/chat.

export const COMPANY_INSTANCE = 'pyraai';

export function lineLabel(instanceName: string | null | undefined): string {
  if (!instanceName || instanceName === COMPANY_INSTANCE) return 'الشركة';
  return instanceName;
}

/** True when the conversation lives on a line other than the company number. */
export function isNonCompanyLine(instanceName: string | null | undefined): boolean {
  return Boolean(instanceName && instanceName !== COMPANY_INSTANCE);
}

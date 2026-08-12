/**
 * When the required-next-step rule applies.
 *
 * The device reports its build in `x-app-version` (already parsed by
 * requireDeviceAuth for the fleet-visibility stamp). Enforcement starts at the
 * build that can actually satisfy the rule.
 */
export const NEXT_STEP_ENFORCED_FROM_VERSION = 11;

export function shouldRequireNextStep(headerValue: string | null): boolean {
  const code = parseInt(headerValue ?? '', 10);
  // Fails OPEN: an unknown client is treated as old. The blocking UI in the app
  // is the primary control; this is the backstop that stops a NEW app from
  // silently regressing, not a gate worth rejecting real work over.
  if (!Number.isInteger(code) || code <= 0) return false;
  return code >= NEXT_STEP_ENFORCED_FROM_VERSION;
}

/**
 * When the required-next-step rule applies.
 *
 * The device reports its build in `x-app-version` (already parsed by
 * requireDeviceAuth for the fleet-visibility stamp). Enforcement starts at the
 * build that can actually satisfy the rule.
 */
export const NEXT_STEP_ENFORCED_FROM_VERSION = 11;

export function shouldRequireNextStep(headerValue: string | null): boolean {
  // Parse strictly: accept only strings that are entirely ASCII digits (after
  // trimming). parseInt is too lenient — '11abc', '11.5', '+11', '1e2' all
  // parse successfully but should fail open, not enforce. A corrupted or
  // truncated header that happens to start with a digit >= 11 would flip
  // enforcement ON for a device that cannot satisfy the requirement, losing
  // work after a real call. Strict parse + fail-open together prevent this.
  const trimmed = (headerValue ?? '').trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return false;

  const code = parseInt(trimmed, 10);
  if (code <= 0) return false;
  return code >= NEXT_STEP_ENFORCED_FROM_VERSION;
}

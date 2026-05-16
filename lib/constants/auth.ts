/**
 * Authentication constants — single source of truth for password + 2FA
 * + session parameters.
 *
 * Phase 14.3 P1 fix #3: introduces `PASSWORD_MIN_LENGTH` to replace 7
 * surfaces that previously declared 6, 8, or 12 inline — producing
 * inconsistent UX (same user could be created with a 6-char password
 * but later asked to reset with a 12-char one). 8 was chosen during
 * Phase 14.3 closure as the canonical value:
 *
 *   - matches NIST SP 800-63B minimum recommendation
 *   - balance of security + UX for a small team (Pyramedia)
 *   - existing dashboard profile pw-change already uses 8 → least churn
 *
 * If a future audit raises the bar (e.g. to 12), change ONLY this
 * constant — all 7 surfaces import it and pick up the new value
 * automatically. Both the server-side API validation AND the
 * client-side form validation should reference this single number.
 */

/**
 * Minimum number of characters a password must contain.
 * Enforced server-side at API validation + mirrored client-side in
 * form-input checks for fast feedback.
 */
export const PASSWORD_MIN_LENGTH = 8;

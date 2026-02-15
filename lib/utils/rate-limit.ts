/**
 * Simple in-memory rate limiter using a Map.
 * Each limiter tracks requests by key (IP, email, etc.)
 * with a sliding window approach.
 *
 * NOTE: This resets on server restart and is per-process only.
 * For multi-instance deployments, use Redis-based rate limiting.
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

const limiters = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Create a named rate limiter with specific config.
 * Returns a function that checks if a key (IP, email, etc.) is rate-limited.
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  if (!limiters.has(name)) {
    limiters.set(name, new Map());
  }

  const store = limiters.get(name)!;

  return {
    /**
     * Check if the key is rate-limited.
     * Returns { limited: false, remaining } if allowed,
     * or { limited: true, retryAfterMs } if blocked.
     */
    check(key: string): {
      limited: boolean;
      remaining: number;
      retryAfterMs: number;
    } {
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Get or create entry
      let entry = store.get(key);
      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

      if (entry.timestamps.length >= config.maxRequests) {
        // Rate limited
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = oldestInWindow + config.windowMs - now;
        return {
          limited: true,
          remaining: 0,
          retryAfterMs: Math.max(retryAfterMs, 0),
        };
      }

      // Allow request — record timestamp
      entry.timestamps.push(now);
      return {
        limited: false,
        remaining: config.maxRequests - entry.timestamps.length,
        retryAfterMs: 0,
      };
    },

    /** Reset a specific key (e.g., after successful login) */
    reset(key: string): void {
      store.delete(key);
    },
  };
}

// ─── Pre-configured limiters for portal auth ───────────────

/** Login: max 5 attempts per IP per 15 minutes */
export const loginLimiter = createRateLimiter('portal-login', {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/** Forgot password: max 3 per email per hour */
export const forgotPasswordLimiter = createRateLimiter('portal-forgot-password', {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
});

/** Reset password: max 5 attempts per IP per 15 minutes */
export const resetPasswordLimiter = createRateLimiter('portal-reset-password', {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/** Password change: max 5 attempts per client per 15 minutes */
export const passwordChangeLimiter = createRateLimiter('portal-password-change', {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/**
 * Extract client IP from request headers.
 * Checks x-forwarded-for first (behind proxy/load balancer), then x-real-ip.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; take the first (client)
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

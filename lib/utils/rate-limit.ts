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

// ─── Pre-configured limiters ────────────────────────────────

/** Portal login: max 5 attempts per IP per 15 minutes */
export const loginLimiter = createRateLimiter('portal-login', {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

/** Admin login: max 5 attempts per IP per 15 minutes */
export const adminLoginLimiter = createRateLimiter('admin-login', {
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

// ─── General API rate limiters ──────────────────────────────

/** API writes (POST/PATCH/DELETE): max 30 per IP per minute */
export const apiWriteLimiter = createRateLimiter('api-write', {
  maxRequests: 30,
  windowMs: 60 * 1000,
});

/** API reads (GET): max 120 per IP per minute */
export const apiReadLimiter = createRateLimiter('api-read', {
  maxRequests: 120,
  windowMs: 60 * 1000,
});

/** File uploads: max 20 per IP per minute */
export const uploadLimiter = createRateLimiter('file-upload', {
  maxRequests: 20,
  windowMs: 60 * 1000,
});

/** Share link downloads (public, no auth): max 30 per IP per minute */
export const shareDownloadLimiter = createRateLimiter('share-download', {
  maxRequests: 30,
  windowMs: 60 * 1000,
});

/** Admin reindex: max 2 per IP per 10 minutes (expensive operation) */
export const reindexLimiter = createRateLimiter('admin-reindex', {
  maxRequests: 2,
  windowMs: 10 * 60 * 1000,
});

/** User password change (admin panel): max 5 per IP per 15 minutes */
export const userPasswordChangeLimiter = createRateLimiter('user-password-change', {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
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

/**
 * Check a rate limiter and return a 429 Response if limited, or null if OK.
 * Use at the top of API route handlers:
 *
 *   const limited = checkRateLimit(apiWriteLimiter, request);
 *   if (limited) return limited;
 */
export function checkRateLimit(
  limiter: ReturnType<typeof createRateLimiter>,
  request: Request
): Response | null {
  const ip = getClientIp(request);
  const result = limiter.check(ip);
  if (result.limited) {
    const retrySeconds = Math.ceil(result.retryAfterMs / 1000);
    return new Response(
      JSON.stringify({
        success: false,
        error: `تجاوزت الحد المسموح. حاول مرة أخرى بعد ${retrySeconds} ثانية`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retrySeconds),
        },
      }
    );
  }
  return null;
}

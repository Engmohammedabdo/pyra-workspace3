'use client';

// ============================================================
// API Helpers — shared fetch utilities for React Query hooks
// ============================================================

/**
 * Error subclass thrown by fetchAPI / mutateAPI on non-2xx responses.
 * Carries the server's structured payload so call-sites can surface
 * the specific Arabic error message from apiError() instead of a
 * generic "API error: 422".
 *
 *   try {
 *     await mutateAPI('/api/...', 'POST', body);
 *   } catch (err) {
 *     if (err instanceof ApiError && err.status === 403) ...
 *     toast.error(err.message);   // server's specific reason
 *   }
 */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function readErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function pickServerMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const v = (body as { error?: unknown }).error;
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return `API error: ${status}`;
}

/**
 * جلب البيانات من API endpoint
 */
export async function fetchAPI<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await readErrorBody(res);
    throw new ApiError(pickServerMessage(body, res.status), res.status, body);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

/**
 * إرسال mutation للـ API (POST, PUT, PATCH, DELETE)
 */
export async function mutateAPI<T>(
  url: string,
  method: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await readErrorBody(res);
    throw new ApiError(pickServerMessage(errBody, res.status), res.status, errBody);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

/**
 * بناء query string من object
 */
export function buildQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v);
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

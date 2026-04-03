'use client';

// ============================================================
// API Helpers — shared fetch utilities for React Query hooks
// ============================================================

/**
 * جلب البيانات من API endpoint
 */
export async function fetchAPI<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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

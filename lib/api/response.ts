import { NextResponse } from 'next/server';

/**
 * Consistent API response helpers
 * All responses follow: { data?, error?, meta? }
 */

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, error: null, meta: meta || null }, { status });
}

export function apiError(error: string, status = 400, meta?: Record<string, unknown>) {
  return NextResponse.json({ data: null, error, meta: meta || null }, { status });
}

export function apiUnauthorized(message = 'غير مصرح — يجب تسجيل الدخول') {
  return apiError(message, 401);
}

export function apiForbidden(message = 'لا تملك صلاحية الوصول') {
  return apiError(message, 403);
}

export function apiNotFound(message = 'غير موجود') {
  return apiError(message, 404);
}

export function apiValidationError(message: string) {
  return apiError(message, 422);
}

export function apiServerError(message = 'خطأ في الخادم') {
  return apiError(message, 500);
}

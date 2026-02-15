import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createMiddlewareSupabaseClient(request, response);

  // Refresh session if it exists
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes - no auth needed
  const publicRoutes = [
    '/login',
    '/portal/login',
    '/portal/forgot-password',
    '/portal/reset-password',
    '/share',
    '/api/health',
    '/api/portal/auth',
  ];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  if (isPublicRoute) {
    // If logged in and trying to access login, redirect to dashboard
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') || pathname === '/') {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Portal routes use cookie-based sessions (NOT Supabase Auth).
  // The portal (main) layout.tsx handles auth via getPortalSession().
  // Middleware only handles Supabase Auth for admin/dashboard routes.
  // Portal pages are server-rendered and will redirect to /portal/login
  // if no valid cookie session exists.

  // Protect admin API routes (except public and portal ones)
  if (
    pathname.startsWith('/api') &&
    !pathname.startsWith('/api/health') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/portal') &&
    !pathname.startsWith('/api/shares/download')
  ) {
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

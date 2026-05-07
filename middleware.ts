import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

// ── CRM redirects ─────────────────────────────────────────────────────────
// Old /dashboard/sales/* URLs that have a 1:1 home in the new CRM module
// 307-redirect to their new equivalent. Order matters — the more-specific
// /sales/leads/[id] rule MUST be tested before the bare /sales/leads rule.
//
// URLs intentionally NOT redirected (still served by their existing pages):
//   /dashboard/sales/chat
//   /dashboard/sales/whatsapp-analytics
//   /dashboard/sales/whatsapp-campaigns
//   /dashboard/sales/approvals
//   /dashboard/sales/settings
const CRM_REDIRECTS: Array<[RegExp, (path: string) => string]> = [
  // /dashboard/sales/leads/<id>[/...]  →  /dashboard/crm/leads/<id>[/...]
  [/^\/dashboard\/sales\/leads\/([^/]+)(\/.*)?$/,
    (p) => p.replace(/^\/dashboard\/sales\/leads\//, '/dashboard/crm/leads/')],
  [/^\/dashboard\/sales\/leads\/?$/,      () => '/dashboard/crm/pipeline'],
  [/^\/dashboard\/sales\/follow-ups\/?$/, () => '/dashboard/crm/follow-ups'],
  [/^\/dashboard\/sales\/reports\/?$/,    () => '/dashboard/crm'],
  [/^\/dashboard\/sales\/?$/,             () => '/dashboard/crm'],
];

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

  // ── CRM URL unification — redirect deprecated /dashboard/sales/* paths
  // to their /dashboard/crm/* equivalents. Runs BEFORE auth so unauth'd
  // users hitting an old URL still get routed to the new one cleanly
  // (the auth gate below will then bounce them to /login with the new
  // path captured in the redirect= param).
  for (const [pattern, build] of CRM_REDIRECTS) {
    if (pattern.test(pathname)) {
      const target = build(pathname);
      const url = new URL(target, request.url);
      // Preserve search params on the way through
      url.search = request.nextUrl.search;
      return NextResponse.redirect(url, 307);
    }
  }

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

  // ── CSRF protection for state-changing API requests ────────
  // External API & Stripe webhooks come from external servers — exempt from CSRF
  if (pathname.startsWith('/api/stripe/webhook') || pathname.startsWith('/api/external')) {
    return response;
  }

  // Verify Origin/Referer header matches the app's host for POST/PATCH/DELETE/PUT
  const method = request.method;
  if (
    pathname.startsWith('/api') &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
  ) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');

    // Use host header, fall back to APP_URL env var
    const effectiveHost = host || new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud').host;

    // Try Origin header first, fall back to Referer
    const sourceUrl = origin || (referer ? new URL(referer).origin : null);

    if (sourceUrl) {
      const sourceHost = new URL(sourceUrl).host;
      if (sourceHost !== effectiveHost) {
        return NextResponse.json(
          { error: 'CSRF validation failed' },
          { status: 403 }
        );
      }
    } else {
      // No Origin or Referer header — block state-changing requests
      // (legitimate browser requests always include at least one of these)
      return NextResponse.json(
        { error: 'CSRF validation failed — missing origin' },
        { status: 403 }
      );
    }
  }

  // Protect admin API routes (except public, portal, and Stripe webhook)
  if (
    pathname.startsWith('/api') &&
    !pathname.startsWith('/api/health') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/portal') &&
    !pathname.startsWith('/api/shares/download') &&
    !pathname.startsWith('/api/stripe/webhook') &&
    !pathname.startsWith('/api/external')
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

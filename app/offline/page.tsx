import { WifiOff } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// /offline — service-worker fallback page (Phase 10 Commit 3 / PWA polish)
//
// This page is precached by `public/sw.js` (PRECACHE_URLS) so that when a
// navigation request fails (network down), the SW serves THIS page instead
// of the browser's default offline error. Pre-Phase-10 the precache pointed
// at a non-existent route and 404'd, breaking the offline-fallback chain.
//
// Constraints:
//   - MUST render without client-side JS (the user is offline; bundle won't
//     load reliably). Server Component — no 'use client', no useState, no
//     useEffect, no hooks.
//   - Minimal — a single visual message + a retry link to /dashboard.
//   - Arabic RTL, Cairo font (inherited from root layout).
//   - Lucide icons render as static SVG at build/SSR — safe in Server
//     Components even without runtime JS.
// ────────────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'غير متصل · Pyra Workspace',
  description: 'لا يوجد اتصال بالإنترنت — أعد المحاولة عند توفّر الاتصال.',
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
          <WifiOff className="w-10 h-10 text-white" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            أنت غير متصل بالإنترنت
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            تحقّق من اتصالك بالشبكة ثم أعد المحاولة. سيتم استرجاع آخر صفحة كنت
            تتصفحها تلقائياً بعد عودة الاتصال.
          </p>
        </div>
        <a
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 text-sm font-medium transition-colors shadow-sm"
        >
          إعادة المحاولة
        </a>
      </div>
    </div>
  );
}

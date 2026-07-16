import type { NextRequest } from 'next/server';

// Release channels: real phones (release builds) are hard-wired to
// 'pyra-calls'; debug/emulator builds use 'pyra-calls-e2e' so E2E test
// releases can never be offered to the production fleet.
//
// Kept in its own module (not inline in a route file) because Next.js App
// Router route files may only export HTTP method handlers + route config —
// exporting anything else (a const, a helper fn) throws a build error.
export const APP_CHANNELS = ['pyra-calls', 'pyra-calls-e2e'] as const;

export function resolveChannel(request: NextRequest): string {
  const app = request.nextUrl.searchParams.get('app') ?? 'pyra-calls';
  return (APP_CHANNELS as readonly string[]).includes(app) ? app : 'pyra-calls';
}

import { NextResponse } from 'next/server';

/**
 * GET /api/health — unauthenticated liveness probe.
 *
 * `commit` and `built_at` are inlined at build time by next.config.ts and exist
 * so a deploy can be confirmed from outside without logging in: compare this
 * commit against the one you pushed. Almost everything this app ships lives
 * behind auth, which previously left no honest way to tell a finished rollout
 * from a container still serving the old build — guessing from user-visible
 * strings produced two false "it deployed" calls on 2026-07-28.
 *
 * A short SHA of a private repo is not a meaningful disclosure on its own.
 *
 * `unknown` means the build could resolve neither a CI-provided commit env var
 * nor a local git checkout. It is reported as-is rather than hidden — a health
 * endpoint that quietly invents a value is worse than one that admits it does
 * not know.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
    commit: process.env.BUILD_COMMIT ?? 'unknown',
    built_at: process.env.BUILD_TIME ?? 'unknown',
  });
}

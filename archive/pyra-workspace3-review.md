# 🔍 Pyra Workspace 3.0 — Code Architecture & Quality Review

**Repo:** https://github.com/Engmohammedabdo/pyra-workspace3  
**Stack:** Next.js 15 + React 19 + Supabase + TypeScript + TailwindCSS  
**Total Lines:** ~9,186 across 85 files  
**Review Date:** 2026-02-15  

---

## 1. Project Structure — 8/10 ✅

```
app/
  (auth)/login/        ← Route group for auth pages
  api/                 ← 20+ API routes, well-organized
  dashboard/           ← Protected dashboard pages
components/
  files/               ← File management components
  layout/              ← Sidebar, topbar, breadcrumb
  providers/           ← Theme + React Query
  ui/                  ← Radix-based UI primitives
hooks/                 ← Custom hooks (useFiles)
lib/
  api/                 ← Auth helpers + response utilities
  auth/                ← Guards + permissions
  supabase/            ← Client/Server/Middleware factories
  utils/               ← Path, ID, format, cn helpers
types/                 ← Database interfaces
```

**Strengths:**
- Clean separation of concerns: `lib/`, `hooks/`, `components/`, `types/`
- API routes follow RESTful conventions with proper HTTP methods
- Route groups `(auth)` used correctly for layout isolation
- UI components in `components/ui/` (shadcn/ui pattern) — good reusability

**Issues:**
- No `lib/validators/` or `lib/schemas/` folder — Zod is installed but not used anywhere for runtime validation
- No `constants/` file — magic strings like bucket names scattered across files
- Missing: no `README.md`, no `docs/` folder, no migration files

---

## 2. TypeScript Quality — 8.5/10 ✅

**Strengths:**
- `strict: true` enabled in `tsconfig.json` ✅
- **Zero `any` types** across the entire codebase — impressive discipline
- Well-defined interfaces in `types/database.ts` (364 lines, 22+ table types)
- Proper use of generic types: `ApiResponse<T>`, `PaginatedResponse<T>`
- Route params typed correctly: `params: Promise<{ path: string[] }>` (Next.js 15 async params)

**Minor Issues:**
- `lib/auth/guards.ts:10` — `permissions: Record<string, unknown>` loses the `UserPermissions` type that's already defined
- `types/database.ts:138` — `search_vector?: unknown` could use a branded type or be excluded
- `lib/api/response.ts` — `meta?: Record<string, unknown>` is loose; could benefit from typed meta

**Verdict:** Very clean TypeScript. No `any` abuse. Types are comprehensive and match the database schema.

---

## 3. Next.js Best Practices — 8/10 ✅

**Strengths:**
- App Router used correctly throughout
- Server Components for pages (`app/dashboard/page.tsx` uses `async` + `requireAuth()`)
- Client Components properly marked with `'use client'` only where needed (14 files)
- `loading.tsx` files for Suspense boundaries
- Metadata exports on pages
- Root layout: proper font loading with `next/font`, RTL support, theme provider
- Turbopack enabled for dev (`next dev --turbopack`)

**Issues:**
- **`app/dashboard/files/page.tsx`** — Server Component that renders `<FileExplorer />` (a client component). Good pattern, but `metadata` export should be in a `layout.tsx` or use `generateMetadata()` for dynamic titles
- **`components/providers/query-provider.tsx`** — QueryClient created inside component (fine with React Query v5, but no `defaultOptions` for error handling)
- **No `error.tsx` boundaries** — missing error boundaries for any route segment
- **No `not-found.tsx`** — missing custom 404 page
- **`app/page.tsx`** — Just `redirect('/dashboard')`. Could use `next.config.ts` redirect instead to avoid a server render

---

## 4. Supabase Integration — 9/10 ✅

**Strengths:**
- **Three-client pattern done perfectly:**
  - `lib/supabase/client.ts` — Browser client via `createBrowserClient`
  - `lib/supabase/server.ts` — Server client via `createServerClient` with cookie handling
  - `lib/supabase/middleware.ts` — Middleware client with request/response cookie sync
- `createServiceRoleClient()` properly isolated for admin operations (user creation, storage)
- Cookie handling follows `@supabase/ssr` v0.6 patterns exactly
- Server component cookie writes wrapped in try/catch (correct for RSC)
- Service role client uses empty cookie handlers (correct — no user context needed)

**Issues:**
- **No connection pooling configuration** — relies on Supabase's default. For production with high traffic, should configure `db` options or use Supabase's built-in pgBouncer via port 6543
- `lib/supabase/server.ts:14` — Non-null assertions (`process.env.NEXT_PUBLIC_SUPABASE_URL!`) everywhere. Should validate env vars at startup
- `hooks/useFiles.ts` — Creates a new browser client on every hook call. Should memoize or use a singleton pattern

---

## 5. Auth Implementation — 7.5/10 ⚠️

**Strengths:**
- Middleware uses `supabase.auth.getUser()` (server-verified, not just JWT decode) ✅
- Dual auth system: `requireAuth()` for pages (redirects), `getApiAuth()` for APIs (returns null)
- Admin guard: `requireAdmin()` / `getApiAdmin()` with proper role checking
- User creation uses service role client with auth mapping table
- Password changes go through Supabase Auth admin API (proper)
- Self-deletion prevention (`app/api/users/[username]/route.ts:146`)

**Issues:**
- **`middleware.ts:49-54`** — API routes only check for user existence, not role-based access. Any authenticated user can hit admin-only endpoints at the middleware level (API handlers check again, but defense-in-depth would be better)
- **`app/api/shares/route.ts:59-60`** — Share link passwords stored as **base64 encoding**, not hashing! Comment even says "In production, use bcrypt." This is a security issue — base64 is trivially reversible
  ```typescript
  // shares/route.ts:59
  passwordHash = Buffer.from(password.trim()).toString('base64');
  ```
- **No rate limiting** on login endpoint (`app/api/auth/login/route.ts`) — brute force vulnerable. `pyra_login_attempts` table exists but is never written to
- **No CSRF protection** beyond Supabase's cookie-based auth
- **Session/token refresh** — middleware refreshes sessions, but no explicit session timeout enforcement beyond Supabase defaults

---

## 6. Code Patterns — 8.5/10 ✅

**Strengths:**
- **DRY API responses** — `lib/api/response.ts` provides `apiSuccess()`, `apiError()`, `apiUnauthorized()`, etc. Used consistently across all 20+ routes
- **DRY auth** — `getApiAuth()` / `getApiAdmin()` reused everywhere
- **Consistent naming:** Arabic UI strings, English code identifiers, camelCase throughout
- **Activity logging** — every mutation logs to `pyra_activity_log` with user, IP, and details
- **Consistent error handling** — try/catch in every route handler with `apiServerError()` fallback
- **ID generation** — `generateId(prefix)` with timestamp + nanoid across all tables

**Issues:**
- **Duplicated file listing logic** — `app/api/files/route.ts` and `hooks/useFiles.ts` both implement the same storage list → filter → transform → sort pipeline. Should share a utility
- **Duplicated trash logic** — `app/api/files/[...path]/route.ts` DELETE and `app/api/files/delete-batch/route.ts` have ~90% identical code for the download→upload-to-trash→delete→index flow. Should extract a `moveToTrash()` helper
- **No request body validation with Zod** — Zod is in `package.json` but never imported. All validation is manual `if` checks. For 20+ routes this is a lot of repetitive validation code
- **`app/api/dashboard/route.ts:98`** — Storage calculation downloads ALL file_size values to sum client-side. Should use a Supabase RPC/SQL `SUM()` instead

---

## 7. Security — 7/10 ⚠️

### ✅ Good:
- **Path traversal protection** — `sanitizePath()` strips `..`, leading slashes, control chars
- **Filename sanitization** — `sanitizeFileName()` strips dangerous chars, limits to 255 chars
- **Service role isolation** — only used for storage and admin operations, never exposed to client
- **`X-Content-Type-Options: nosniff`** on file downloads
- **Content-Disposition** set correctly (inline vs attachment based on MIME type)
- **Signed URLs** with 1-hour expiry for file access

### ⚠️ Concerns:

1. **SQL Injection via `ilike` template literals** — Multiple routes interpolate user input directly into Supabase filter strings:
   ```typescript
   // app/api/users/route.ts:39
   query = query.or(`username.ilike.%${search.trim()}%,display_name.ilike.%${search.trim()}%`);
   
   // app/api/projects/route.ts:45
   query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
   
   // app/api/clients/route.ts:44
   query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
   ```
   While Supabase's PostgREST layer parameterizes queries, special characters in the filter string (like `,`, `.`, `(`, `)`) could manipulate the filter syntax. User input should be escaped or use `.ilike()` method directly.

2. **Share link password = base64** (`app/api/shares/route.ts:59`) — Already noted. Trivially decoded. Must use bcrypt/argon2.

3. **No rate limiting** anywhere — login, file upload, share downloads all unbounded.

4. **Download count race condition** (`app/api/shares/download/[token]/route.ts:83`):
   ```typescript
   .update({ download_count: shareLink.download_count + 1 })
   ```
   Should use `download_count + 1` in SQL or an RPC to avoid TOCTOU race.

5. **IP address from `x-forwarded-for`** — Can be spoofed. Acceptable for logging but should not be trusted for security decisions.

6. **Storage bucket name in `NEXT_PUBLIC_*`** env var — exposed to client. Not a vulnerability per se, but reduces obscurity.

7. **No input length limits** on search queries — could cause expensive `ilike` scans on large tables.

---

## Summary Scorecard

| Area | Score | Status |
|------|-------|--------|
| 1. Project Structure | **8/10** | ✅ Clean and scalable |
| 2. TypeScript Quality | **8.5/10** | ✅ Strict, zero `any`, comprehensive types |
| 3. Next.js Best Practices | **8/10** | ✅ Proper App Router usage, missing error boundaries |
| 4. Supabase Integration | **9/10** | ✅ Textbook three-client pattern |
| 5. Auth Implementation | **7.5/10** | ⚠️ Base64 passwords, no rate limiting |
| 6. Code Patterns | **8.5/10** | ✅ Consistent, some duplication |
| 7. Security | **7/10** | ⚠️ Filter injection risk, weak share passwords |
| **Overall** | **8.1/10** | **Solid foundation, needs security hardening** |

---

## 🔧 Top Priority Fixes

1. **🔴 CRITICAL** — Replace base64 share passwords with bcrypt (`app/api/shares/route.ts:59`)
2. **🔴 HIGH** — Sanitize/escape search inputs in `.or()` filter strings (5 routes affected)
3. **🟡 MEDIUM** — Add rate limiting to login + share download endpoints
4. **🟡 MEDIUM** — Add `error.tsx` boundaries to route segments
5. **🟡 MEDIUM** — Use Zod schemas for request body validation (already installed, unused)
6. **🟢 LOW** — Extract shared trash/file-listing logic to reduce duplication
7. **🟢 LOW** — Add env var validation at startup (e.g., with `zod` or `t3-env`)
8. **🟢 LOW** — Use SQL `SUM()` for storage calculation instead of client-side reduction

---

*Reviewed by PyraAI • Pyra Workspace 3.0 Code Review*

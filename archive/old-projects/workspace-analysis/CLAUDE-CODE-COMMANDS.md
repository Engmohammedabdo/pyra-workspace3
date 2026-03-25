# Claude Code Commands — Client Portal (9 Phases: 0-8)

> **مرجع:** PRD-client-portal.md  
> **ملاحظة:** كل أمر جاهز للنسخ واللصق في Claude Code.  
> **نفّذ بالترتيب:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8  
> **التقنيات مفتوحة:** Tailwind, Alpine.js, HTMX, أي library حديثة مسموحة

---

## Phase 0: Project Restructuring

```
## Phase 0: Project Restructuring & Organization

### Context:
The current Pyra Workspace project (https://github.com/Engmohammedabdo/pyra-workspace) has ALL files in the root directory — a flat structure with no organization. Before building the Client Portal, we need to restructure the project into a clean, professional folder layout.

### Before you start:
- Read the FULL project structure. The current layout is:
  ```
  pyra-workspace/
  ├── index.php          # Main app shell + HTML (~280 lines)
  ├── api.php            # REST API — 50+ endpoints (~1,794 lines)
  ├── auth.php           # Authentication + helpers (~827 lines)
  ├── app.js             # Frontend SPA controller (~4,089 lines)
  ├── style.css          # All styles — dark luxury theme (~4,299 lines)
  ├── schema.sql         # Database schema (~250 lines)
  ├── config.php         # ⛔ gitignored — Supabase credentials
  ├── config.example.php # Config template
  ├── setup.php          # Setup wizard (~320 lines)
  ├── ROADMAP.md
  ├── README.md
  └── .gitignore
  ```
- Read EVERY file to understand ALL cross-references:
  - `index.php` references: `style.css`, `app.js`, `config.php`, `auth.php`
  - `api.php` references: `config.php`, `auth.php`
  - `app.js` references: `api.php` endpoints (via fetch)
  - `style.css` references: Google Fonts CDN
  - `setup.php` references: `config.php`, `schema.sql`
  - All `require_once` / `include` paths in PHP files
  - All `<link>`, `<script>`, `fetch()` URLs in HTML/JS
- This is a LIVE production site at http://workspeace.pyramedia.info/ — nothing can break!

### Target structure:
```
pyra-workspace/
├── index.php                    # Main entry (stays in root — PHP routing requirement)
├── config.php                   # ⛔ gitignored (stays in root)
├── config.example.php           # Config template (stays in root)
├── setup.php                    # Setup wizard (stays in root — needs direct access)
├── .htaccess                    # Apache rewrite rules (if needed)
│
├── includes/                    # PHP backend files
│   ├── auth.php                 # Authentication + authorization
│   └── helpers.php              # Shared utility functions (if extracted)
│
├── api/                         # API endpoints
│   └── index.php                # Main API (renamed from api.php, or api.php redirects here)
│   
├── assets/                      # Static assets
│   ├── css/
│   │   └── style.css            # Main stylesheet
│   ├── js/
│   │   └── app.js               # Main frontend controller
│   ├── images/                  # Logos, icons, placeholders
│   └── fonts/                   # Local fonts (if self-hosted later)
│
├── portal/                      # 🆕 Client Portal (new — built in later phases)
│   ├── index.php                # Portal entry + API
│   ├── assets/
│   │   ├── css/
│   │   │   └── portal.css       # Portal styles
│   │   └── js/
│   │       └── portal-app.js    # Portal frontend
│   └── includes/                # Portal-specific PHP (if needed)
│
├── database/                    # SQL files
│   ├── schema.sql               # Original schema
│   └── portal-schema.sql        # 🆕 Portal tables (Phase 1)
│
├── docs/                        # Documentation
│   ├── README.md
│   └── ROADMAP.md
│
└── .gitignore                   # Updated
```

### Tasks:

#### Task 1: Analyze ALL references
Before moving ANYTHING, map out every reference between files:
- `grep -rn "require_once\|include\|require " *.php` — find all PHP includes
- `grep -rn "api\.php\|auth\.php\|config\.php" *.php` — find all PHP cross-references
- `grep -rn "style\.css\|app\.js\|mammoth" index.php` — find all frontend asset references
- `grep -rn "fetch\(" app.js` — find all API endpoint references
- `grep -rn "href=\|src=" index.php setup.php` — find all HTML references
- Document every reference you find before making changes

#### Task 2: Create the directory structure
```bash
mkdir -p includes api assets/css assets/js assets/images portal database docs
```

#### Task 3: Move files (one at a time, test after each!)

**Order matters — move backend files first, then frontend:**

1. Move `auth.php` → `includes/auth.php`
   - Update `require_once` in `index.php`, `api.php`, `setup.php`
   - Test: login still works

2. Move `schema.sql` → `database/schema.sql`
   - Update reference in `setup.php`
   - Test: setup page still works (if accessible)

3. Move `style.css` → `assets/css/style.css`
   - Update `<link>` in `index.php`
   - Test: styles load correctly

4. Move `app.js` → `assets/js/app.js`
   - Update `<script>` in `index.php`
   - Test: app functionality works

5. Move `api.php` → keep `api.php` in root as a thin redirect OR update all fetch() calls in app.js
   - **Option A (recommended):** Keep `api.php` in root but make it a 1-line include:
     ```php
     <?php require_once __DIR__ . '/api/index.php';
     ```
     Then move the actual code to `api/index.php`. This way ALL existing fetch('api.php?...') calls still work.
   - **Option B:** Move to `api/index.php` and update ALL fetch URLs in app.js from `'api.php?'` to `'api/index.php?'` or `'api/?'`
   - Test: EVERY API call still works (files, folders, search, users, settings, etc.)

6. Move `README.md` → `docs/README.md` (keep a symlink or copy in root for GitHub)
   Move `ROADMAP.md` → `docs/ROADMAP.md`

#### Task 4: Update .gitignore
Add new paths:
```
config.php
*.log
.env
node_modules/
.DS_Store
Thumbs.db
```

#### Task 5: Update all internal references
- In `api/index.php` (moved api.php): update `require_once` for `config.php` and `includes/auth.php`
- In `index.php`: update paths to `assets/css/style.css`, `assets/js/app.js`
- In `includes/auth.php`: update `require_once` for `config.php` (now `__DIR__ . '/../config.php'`)
- In `setup.php`: update paths to `includes/auth.php`, `database/schema.sql`, `config.php`
- In `app.js`: update API URL if needed (if using Option B)

#### Task 6: Verify mammoth.js CDN reference
- `mammoth.js` is loaded via CDN in `index.php` — verify the `<script>` tag still works
- No local file to move

#### Task 7: Comprehensive testing
Test EVERY feature of the existing site:
1. Login page loads with correct styling
2. Login works (correct + incorrect credentials)
3. Dashboard loads (file browser, folder navigation)
4. File upload works
5. File preview works (images, PDFs, documents)
6. Search works
7. User management works (admin)
8. Settings work
9. Themes work
10. Reviews/comments work
11. Share links work
12. All API endpoints return correct responses

### Testing checklist:
- [ ] Homepage loads at `/` — login screen with full styling
- [ ] Login works — redirects to dashboard
- [ ] All CSS loads — no broken styles, no missing fonts
- [ ] All JS loads — app is functional, no console errors
- [ ] File browser works — navigate folders, view files
- [ ] File upload works — drag & drop + button
- [ ] File preview works — images, PDFs, videos, documents
- [ ] API endpoints all work — test 5-10 key endpoints
- [ ] Search works
- [ ] Settings page works
- [ ] Share links work
- [ ] Mobile responsive — still works on small screens
- [ ] No 404 errors in Network tab
- [ ] No console errors
- [ ] PHP error log is clean (no include/require failures)

### ⚠️ CRITICAL:
- Move ONE file at a time, test, then move the next
- If something breaks, revert IMMEDIATELY — don't try to fix forward
- Keep `api.php` accessible at root (redirect pattern) — existing integrations may depend on it
- `config.php` MUST stay in root (or update ALL includes — risky)
- DO NOT rename functions or change any logic — this phase is ONLY about file organization
- Test on the LIVE URL if possible, or use a local PHP server
```

---

## Phase 1: Database + Supabase Setup

```
## Phase 1: Database Schema & Supabase Setup

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Section 4 (Database Schema) completely
- Read the existing `database/schema.sql` to understand current naming conventions and patterns
- Read `config.php` to understand the Supabase connection (SUPABASE_URL, SUPABASE_KEY, BUCKET)
- Read `includes/auth.php` to see how `dbRequest()` works — you'll use the same function
- Verify Phase 0 completed: project is reorganized, everything works
- DO NOT modify any existing tables or `database/schema.sql`

### What to build:
Create `database/portal-schema.sql` with 7 new tables for the Client Portal system. Then execute it on Supabase.

### Tasks:
1. Create file `database/portal-schema.sql` with these tables (follow the EXACT naming/pattern from PRD §4.1):
   - `pyra_clients` — client accounts (id VARCHAR(20) PK, email UNIQUE, password_hash, company, role CHECK, status CHECK, language, etc.)
   - `pyra_projects` — projects linked to clients via `client_company` field
   - `pyra_project_files` — files within projects (FK to pyra_projects, ON DELETE CASCADE)
   - `pyra_file_approvals` — approval records per file per client (UNIQUE(file_id, client_id))
   - `pyra_client_comments` — threaded comments (author_type: 'client'|'team', parent_id for replies, is_read_by_client, is_read_by_team)
   - `pyra_client_notifications` — in-app notifications for clients (type CHECK with 6 types)
   - `pyra_client_password_resets` — password reset tokens (expires_at, used flag)

2. Add all indexes as specified in PRD §4.1:
   - Standard indexes on FK columns
   - Partial indexes: `WHERE is_read = FALSE`, `WHERE needs_approval = TRUE`
   - Unique index on `pyra_clients.email`

3. Create 2 helper views:
   - `v_project_summary` — projects joined with file_count, approved_count, pending_count, revision_count
   - `v_pending_approvals` — pending approvals joined with file info and project info

4. Execute the SQL on Supabase:
   - Use the Supabase SQL editor or create a PHP migration script
   - Verify all tables, indexes, and views are created

5. Insert test data to verify:
   - 1 test client (email: test@pyramedia.info, password: hashed)
   - 2 test projects with different statuses
   - 5 test files across the projects
   - Some approval records and notifications

### Design constraints:
- ID generation pattern: `prefix_timestamp_random` (e.g., `c_1707926400_a3f2`)
- `VARCHAR(20)` for all IDs (same as existing `pyra_reviews` pattern)
- `TIMESTAMPTZ` for all timestamps
- All CHECK constraints exactly as specified in PRD
- Foreign keys with ON DELETE CASCADE where specified

### Testing checklist:
- [ ] All 7 tables created on Supabase
- [ ] Foreign keys work (insert referencing non-existent parent → fails)
- [ ] UNIQUE constraints work (duplicate email → fails, duplicate file_id+client_id → fails)
- [ ] Views return correct structure
- [ ] Test data inserted successfully
- [ ] Existing website still works perfectly — zero regressions
- [ ] Code is clean

### ⚠️ Do NOT:
- Modify existing tables or database/schema.sql
- Add RLS policies (app uses service_role key)
- Change any existing file
```

---

## Phase 2: API Endpoints (Portal Backend)

```
## Phase 2: API Endpoints — Portal Backend + Auth Functions

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 2.1 (Auth), 5.1-5.3 (API Endpoints), 9.1 (PHP patterns), 9.4 (Auth functions)
- Read `includes/auth.php` COMPLETELY — understand every function: isLoggedIn(), dbRequest(), jsonResponse(), recordLoginAttempt(), requireAdmin()
- Read `api.php` (root) and `api/index.php` (if restructured) COMPLETELY — understand the switch/case pattern, auth checks, error handling
- Read `config.php` — understand SUPABASE_URL, SUPABASE_KEY, BUCKET constants
- Verify Phase 1 tables exist (query pyra_clients table)
- DO NOT modify existing functions in auth.php — only ADD at the bottom
- DO NOT modify existing cases in api.php — only ADD new cases

### What to build:
1. Client auth functions in `includes/auth.php`
2. Portal API backend at `portal/index.php`
3. Team-facing endpoints in existing `api.php`/`api/index.php`

### Tasks:

#### Task 1: includes/auth.php — Add client auth functions (at END of file)
Add these AFTER all existing code:
```php
// ============ Client Portal Authentication ============
```
- `isClientLoggedIn(): bool` — checks $_SESSION['client_id'] is set and not empty
- `getClientData(): ?array` — returns array with id, name, email, company, role, csrf_token from session
- `requireClientAuth(): array` — returns getClientData() or sends 401 JSON + exit
- `validateClientCsrf(): void` — checks X-CSRF-Token header vs $_SESSION['client_csrf_token'], sends 403 on mismatch
- `isClientAccountLocked(string $email): bool` — checks pyra_login_attempts for 'client:{email}', 5 attempts = 15 min lockout (same pattern as existing isAccountLocked)
- `sendClientEmail(string $to, string $subject, string $htmlBody): bool` — PHP mail() with HTML headers, wrapped in try/catch, returns false on failure

#### Task 2: portal/index.php — Portal API backend (new file)
Create `portal/index.php` following PRD §5.1 structure exactly.

**File structure:**
```php
<?php
session_start();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/auth.php';

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');

$action = $_GET['action'] ?? '';
$publicActions = ['client_login', 'client_logout', 'client_session', 'client_forgot_password', 'client_reset_password', 'getPublicSettings'];

if ($action && !in_array($action, $publicActions)) {
    $client = requireClientAuth();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        validateClientCsrf();
    }
}

if ($action) {
    header('Content-Type: application/json');
    switch ($action) {
        // ... all cases ...
    }
    exit;
}

// No action = render HTML (Phase 3)
```

**Implement ALL these endpoints (see PRD §5.2 for exact request/response format):**

Auth:
- `client_login` — POST, email+password, usleep(200000), lockout check, password_verify, session_regenerate_id, set all session keys, update last_login_at, record attempt
- `client_logout` — POST, unset all client session keys
- `client_session` — GET, return authenticated status + client data + csrf_token
- `client_forgot_password` — POST, generate token, save to pyra_client_password_resets, return message (email in Phase 7)
- `client_reset_password` — POST, verify token + expiry + used flag, update password_hash, mark token used

Dashboard:
- `client_dashboard` — GET, aggregate: active projects (company filter), pending approvals (client_id), recent files, unread counts, recent notifications

Projects:
- `client_projects` — GET, list by company, exclude draft/archived, pagination (20/page)
- `client_project_detail` — GET, project info + files with approval status, company check, pagination

Files:
- `client_file_preview` — GET, file info + public_url + approval data, verify project belongs to company
- `client_download` — GET, verify access, redirect to Supabase public URL with Content-Disposition

Approvals:
- `client_approve_file` — POST, verify primary role, update status='approved', create team notification in pyra_notifications
- `client_request_revision` — POST, verify primary role, validate comment (min 10 chars), update status='revision_requested'+comment, notify team

Comments:
- `client_get_comments` — GET, threaded (parent + replies), by project_id, optional file_id filter
- `client_add_comment` — POST, validate text (min 3 chars), author_type='client', notify team
- `client_mark_comments_read` — POST, mark team comments as read by client

Notifications:
- `client_unread_count` — GET, count where is_read=false and client_id matches
- `client_notifications` — GET, paginated list
- `client_mark_notif_read` — POST, mark single notification read
- `client_mark_all_read` — POST, mark all for this client

Profile:
- `client_profile` — GET, return client data
- `client_update_profile` — POST, update name/phone/language only (NOT email/role/company)
- `client_change_password` — POST, verify current, validate new (min 8), update hash
- `getPublicSettings` — same as existing (reads pyra_settings)

**SECURITY — Every query MUST filter by client_company or client_id. No exceptions.**

#### Task 3: api.php — Team-facing endpoints (add new cases)
Add to existing switch($action):
- `manage_clients` — GET: list all (admin only). POST sub_action: create (hash password, generate ID), update, delete
- `manage_projects` — GET: list (optional company filter). POST sub_action: create (generate ID, set storage_path), update (notify clients on status change), delete
- `manage_project_files` — POST: add file to project (generate ID, if needs_approval → create approval records for all primary clients in company, notify clients)
- `team_reply_to_client` — POST: add comment with author_type='team', notify client (pyra_client_notifications)
- `getClientComments` — GET: list comments for a project (for team's review panel)

### Testing checklist:
- [ ] Client login works with test account
- [ ] Wrong password → Arabic error message
- [ ] Account lockout after 5 failed attempts
- [ ] Client session separate from team session (both coexist)
- [ ] CSRF validated on POST requests
- [ ] Client only sees own company's projects
- [ ] Dashboard returns correct aggregate data
- [ ] All endpoints return proper JSON with success field
- [ ] Team CRUD for clients works
- [ ] Team CRUD for projects works
- [ ] Adding project file creates approval records automatically
- [ ] Existing website works — zero regressions
- [ ] Code is clean, consistent style, Arabic error messages

### ⚠️ Do NOT:
- Modify existing auth.php functions
- Modify existing api.php cases
- Change session config or security headers
- Skip client_company filtering on ANY query
- Store passwords in plain text
```

---

## Phase 3: Client Login Page

```
## Phase 3: Client Login Page — UI with Modern Stack

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 6.2 (HTML Structure), 6.4 (CSS), 3.2 (UI/UX Design System)
- Read the existing `index.php` to see the current login screen design
- Read `assets/css/style.css` to understand ALL CSS variables and the design system
- Verify Phase 2 endpoints work (test client_login, client_session)

### Tech stack decision — You're FREE to choose:
You can use ANY modern frontend technology. Evaluate and pick the best combination:

**CSS Options (pick one or combine):**
- **Tailwind CSS v4** (via CDN Play) — rapid utility-first styling, great for prototyping
- **Vanilla CSS** with modern features (nesting, :has(), container queries, @layer)
- **UnoCSS** — lighter alternative to Tailwind

**JS Options (pick one or none):**
- **Alpine.js** — lightweight reactivity, perfect for server-rendered apps
- **HTMX** — HTML-driven interactivity (less JS)
- **Vanilla JS** — if you prefer full control
- **Petite-Vue** — minimal Vue for progressive enhancement

**Animation Options:**
- **CSS only** — @keyframes, transitions, View Transitions API
- **Motion One** — lightweight animation library (successor to Anime.js)
- **Auto-Animate** — drop-in animations

**Recommendation:** Tailwind CSS v4 (CDN) + Alpine.js — fast to build, beautiful results, tiny footprint. But choose what you think will produce the BEST result.

**Whatever you choose:**
- Load via CDN — no build step, no npm, no bundler
- Document your choice in a comment at the top of each file
- Make sure it doesn't conflict with the existing site's styles/scripts

### What to build:
A STUNNING login page at `/portal/` that feels premium and modern.

### Tasks:

#### Task 1: portal/index.php — HTML rendering
Below the API switch/case block, add the HTML rendering:
- No `?action=` → render full HTML page
- `isClientLoggedIn()` → render App Shell (content filled in Phase 4)
- Not logged in → render Login Screen

**Login Screen features:**
- Animated background (particles, gradient mesh, or modern pattern — pick what looks best)
- Glass morphism login card with depth
- Pyramedia branding (logo/name from settings + "بوابة العملاء" subtitle)
- Email input (autofocus, autocomplete="email")
- Password input with show/hide toggle
- Login button with loading state (spinner + disabled)
- "نسيت كلمة المرور؟" link
- Error display with animation
- RTL layout (dir="rtl", lang="ar")
- Fully responsive (375px → 1440px+)

**App Shell (logged-in state):**
- Top bar: logo, navigation buttons (dashboard, projects, notifications with badge), user menu (name, profile btn, logout btn)
- Main content area `#portal-main`
- Toast container
- Modal overlay
- `window.PORTAL_CONFIG` with: supabaseUrl, bucket, client data, csrf_token, settings

#### Task 2: Portal CSS/Styling
Create `portal/assets/css/portal.css` (or configure Tailwind):

**If using Tailwind:**
- Load Tailwind v4 via CDN Play `<script src="https://cdn.tailwindcss.com">`
- Configure custom theme extending the Pyra Workspace colors:
  ```js
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          pyra: { bg: '#0a0e14', card: '#111620', accent: '#F97316', ... }
        }
      }
    }
  }
  ```
- Use `@apply` in a `<style type="text/tailwindcss">` block for reusable components
- Custom utilities for glass morphism, animations

**If using vanilla CSS:**
- Use modern features: @layer, CSS nesting, :has(), container queries
- color-mix() for dynamic color variants
- backdrop-filter for glass morphism

**Must have (regardless of approach):**
- Animated background (particles or gradient mesh)
- Glass morphism with depth (multiple blur layers)
- Smooth micro-interactions (input focus glow, button hover scale, error shake)
- Skeleton loading placeholders
- Login card entrance animation
- Password toggle (CSS or JS, no library)
- Custom styled inputs matching the dark theme
- prefers-reduced-motion support
- Fonts: Cairo (Arabic) + Inter (English) from Google Fonts

#### Task 3: portal/assets/js/portal-app.js — Basic stub
Create with PortalApp object:
- `init()` — called on DOMContentLoaded
- `handleLogin(event)` — form submit, POST to client_login, handle success/error
- `handleLogout()` — POST to client_logout, reload
- `showScreen(screen, params)` — screen router placeholder
- `apiFetch(endpoint, options)` — fetch wrapper with CSRF header
- `toast(msg, type)` — toast notification
- `escHtml(str)` / `escAttr(str)` — XSS utilities
- Other method stubs for later phases

**If using Alpine.js:**
```js
// Alpine.js approach — reactive, clean
document.addEventListener('alpine:init', () => {
  Alpine.data('portalApp', () => ({
    screen: 'dashboard',
    loading: false,
    // ... reactive state
    async login() { ... },
    async logout() { ... },
  }))
})
```

### Design requirements — PREMIUM feel:
- This login page is the first thing clients see — it must IMPRESS
- Think: Vercel login, Linear login, Stripe login — that level of polish
- Dark theme, rich colors, subtle depth
- Typography: crisp, proper weights, good spacing
- Animation: smooth 60fps, purposeful (not gratuitous)
- Mobile: card fills gracefully, background adapts
- The glass effect should have REAL depth — not just a blur on a flat surface

### Testing checklist:
- [ ] `/portal/` shows stunning login screen
- [ ] Login with valid credentials → app shell loads
- [ ] Login with invalid credentials → error with animation
- [ ] Loading state on button during request
- [ ] Account lockout message after 5 failures
- [ ] "نسيت كلمة المرور" link works
- [ ] RTL correct (inputs, text, alignment)
- [ ] Mobile (375px) — beautiful
- [ ] Tablet (768px) — proper spacing
- [ ] Desktop (1440px) — centered, immersive
- [ ] No console errors
- [ ] Existing site at `/` still works perfectly
- [ ] Fonts load (Cairo + Inter)
- [ ] prefers-reduced-motion disables animations
- [ ] Clean code — documented tech choices

### ⚠️ Do NOT:
- Add npm, webpack, vite, or any build tool — CDN only
- Modify existing site styles (assets/css/style.css)
- Use !important
- Make the portal depend on the main site's app.js
```

---

## Phase 4: Client Dashboard

```
## Phase 4: Client Dashboard + Projects List

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 2.2 (Dashboard), 2.3.3 (Project List), 6.3 (portal-app.js code)
- Read current portal files (portal-app.js, portal.css, portal/index.php)
- Verify login works and API endpoints return data
- Create/verify test data: 2-3 projects, 5-10 files, approval records, notifications
- Understand the tech stack chosen in Phase 3 (Tailwind? Alpine? Vanilla?)

### What to build:
The main dashboard and projects list — the first screens clients see after login.

### Tasks:

#### Task 1: Seed realistic test data
Create a PHP script or SQL to insert:
- 1 test client (if not exists)
- 3 projects: "Social Media Campaign" (active), "Brand Identity" (review), "Website Redesign" (in_progress)
- 10+ files across projects (jpg, png, pdf, mp4, mp3, docx — various types)
- 5 approval records (2 pending, 2 approved, 1 revision_requested)
- 5 notifications (new_file, comment_reply, project_status, approval_reset, welcome)
- 3 comments (1 from team, 2 from client, 1 as a reply)

#### Task 2: Dashboard view
Implement the dashboard with these cards:

**Welcome Card (full width, hero-style):**
- "👋 مرحباً، {name}" — large heading
- Company name — secondary text
- Last login: relative time ("قبل 3 أيام")
- Subtle brand gradient background or mesh pattern

**Stats Cards (grid row):**
- Active projects count (with project list preview)
- Pending approvals count (pulsing if > 0, with file list)
- Recent files (file icon + name + size)
- Unread notifications (with preview list)

**Card interactions:**
- Click card → navigate to relevant screen
- Click item in card list → navigate to specific project/file
- Hover: lift effect, border glow

**Design details:**
- Use skeleton loading while API fetches (animated gradient placeholders)
- Staggered entrance animation for cards (each card appears 50ms after previous)
- Large, impactful count numbers in cards
- Status badges with consistent colors (active=green, review=amber, completed=blue)
- Empty states: friendly message + icon, not just "no data"

#### Task 3: Projects list view
Implement projects grid:
- Page title: "📁 المشاريع"
- Filter tabs: [الكل] [نشط] [مراجعة] [مكتمل]
- Grid of project cards (responsive: 3 cols → 2 → 1)
- Each card: cover image (or gradient placeholder), status badge, name, description excerpt, deadline, file count, pending approval count
- Click → navigate to project detail (Phase 5)
- Pagination at bottom
- Empty state when no projects match filter

#### Task 4: Navigation system
- Screen router: dashboard, projects, project_detail, file_preview, notifications, profile
- Nav button active state (highlight current screen)
- View Transitions API for smooth screen changes (with fallback to CSS animation)
- Browser history: pushState for each screen, popstate handler for back button
- Notification badge: poll every 30 seconds, update count, show/hide badge

#### Task 5: Styling
Whether Tailwind or custom CSS, ensure:
- Glass morphism cards with hover depth effect
- Skeleton loading states (not just spinners)
- Container-based responsiveness on cards
- Smooth scroll-in animations for cards entering viewport
- Status colors consistent with PRD (active=#10b981, review=#f59e0b, completed=#3b82f6, etc.)
- Dashboard grid adapts to content (CSS Grid auto-fit/fill)
- Beautiful empty states

### Testing checklist:
- [ ] Dashboard loads with all cards populated
- [ ] Skeleton loading appears before data loads
- [ ] Project cards display correctly (cover, status, name, deadline)
- [ ] Click project → navigates to detail (placeholder OK)
- [ ] Filter tabs work on projects list
- [ ] Pagination works
- [ ] Empty states display correctly
- [ ] Dashboard ↔ Projects navigation smooth
- [ ] Notification badge shows correct count, updates every 30s
- [ ] Mobile: single column, everything visible
- [ ] RTL: all text, badges, layout correct
- [ ] No console errors
- [ ] Existing site still works
- [ ] Clean code

### ⚠️ Do NOT:
- Break the login screen (Phase 3)
- Skip skeleton loading states
- Hardcode data — everything from API
```

---

## Phase 5: Project View + File Browsing

```
## Phase 5: Project Detail + File Preview + Approval Actions

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 2.3.4 (Project Detail), 2.4 (File Viewing & Approval)
- Read current portal-app.js — understand navigation and screen router
- Verify test data has files of different types (image, PDF, video, audio, document)
- Test that client_project_detail and client_file_preview endpoints return correct data

### What to build:
Project detail page with file listing, file preview system (images, video, audio, PDF), and the approval workflow.

### Tasks:

#### Task 1: Project Detail View
Implement project detail screen:

**Header:**
- Back button (← رجوع) → projects list
- Project name + status badge
- Description
- Date range (start → deadline)
- Progress bar: approved/(approved+pending+revision) × 100%
  - Animated gradient fill (accent → green)
  - Percentage text
- Stats row: 📁 total files, ⏳ pending, ✅ approved, ❌ revision

**Filter system:**
- Approval filter tabs: [الكل] [بانتظار الموافقة] [موافق عليه] [تعديل مطلوب]
- Category filter: [الكل] [تصاميم] [فيديو] [مستندات] [صوت]
- Client-side filtering (keep all files in memory, filter on click) or re-fetch from API
- Active filter indicated visually

**File list:**
- Each file: type icon, name (clickable), size, version badge, date, approval badge
- Approval badges: ⏳ pending (amber), ✅ approved (green), ❌ revision (red)
- Action buttons: 👁️ preview, ⬇️ download
- Files sorted by date DESC
- Hover effect on file rows

**Comments placeholder:**
- Container `#project-comments` for Phase 6

#### Task 2: File Preview
Implement file preview screen/modal:

**Header:**
- Back button → project detail
- File name, size, version, upload date
- Download button

**Preview by type:**
- `image/*` → `<img>` responsive, click-to-zoom (CSS transform: scale + transition)
- `application/pdf` → `<iframe>` full-width, 80vh height
- `video/*` → `<video controls>` dark backdrop
- `audio/*` → `<audio controls>` with visual waveform area (styled)
- Other → placeholder icon + "لا يمكن معاينة هذا الملف" + download button

**Image zoom:**
- Click image → toggles CSS class with transform: scale(1.8)
- Smooth transition (0.3s ease)
- Click again or click overlay → zoom out
- No library needed

#### Task 3: Approval workflow
Implement in file preview:

**If file.needs_approval and client.role === 'primary':**

Pending state:
- "⏳ هذا الملف بانتظار موافقتك" heading
- ✅ "موافقة" button (green)
- ❌ "طلب تعديل" button (red)

Approve flow:
- Confirm dialog: "هل تريد الموافقة على هذا الملف؟"
- POST to client_approve_file
- On success: toast "✅ تمت الموافقة", refresh view
- Team gets notification

Revision flow:
- Click ❌ → textarea slides open (smooth max-height transition)
- Placeholder: "وصف التعديلات المطلوبة..."
- Validate: min 10 chars (show char count)
- Submit → POST to client_request_revision
- On success: toast "تم إرسال طلب التعديل", refresh view
- Team gets notification

Approved state: ✅ green card, approval date
Revision state: ❌ red card, comment text, date

**If role is 'billing' or 'viewer':** show status badge only, no action buttons

#### Task 4: Download function
```js
downloadFile(fileId) → fetch download URL → create <a download> → click → remove
```
Or simpler: `window.open('index.php?action=client_download&file_id=...')`

#### Task 5: Styling
- File list items: clean layout, icon + info + actions aligned
- Preview area: dark backdrop, centered content, max dimensions
- Image zoom: smooth scale with dark overlay
- Filter tabs: pill-style, sliding active indicator (CSS only)
- Progress bar: satisfying gradient animation
- Approval section: prominent, clear call-to-action
- Revision textarea: slide-open animation
- Character count near textarea
- Mobile: file list stacks, preview fullscreen-ish

### Testing checklist:
- [ ] Project detail loads with correct info
- [ ] Progress bar shows correct percentage
- [ ] File icons correct for each type
- [ ] Filter tabs work (both approval and category)
- [ ] Image preview renders and is zoomable
- [ ] PDF renders in iframe
- [ ] Video plays with controls
- [ ] Audio plays with controls
- [ ] Unknown files show download placeholder
- [ ] Download works for all types
- [ ] Approve → status changes → toast → team notified
- [ ] Revision → min 10 chars enforced → status changes → toast
- [ ] billing/viewer roles: see status, no action buttons
- [ ] Navigation: Dashboard → Projects → Detail → Preview → back works
- [ ] Browser back button works
- [ ] Mobile responsive
- [ ] RTL correct (filters, items, approval section)
- [ ] No console errors
- [ ] Existing site works
- [ ] Clean code

### ⚠️ Do NOT:
- Add image zoom library
- Break dashboard or projects list
- Skip approval flow — it's core
- Forget to refresh view after approval action
```

---

## Phase 6: Comments + Notifications

```
## Phase 6: Comments System + In-App Notifications

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 2.5 (Comments), 2.6 (Notifications)
- Read portal-app.js — understand screen structure and placeholder containers
- Read API endpoints: client_get_comments, client_add_comment, client_notifications, etc.
- Verify api.php has team_reply_to_client and getClientComments
- Add test comments and notifications if not enough test data

### What to build:
1. Threaded comment system for projects and files
2. Full notification system with badge, list page, mark-as-read
3. Bidirectional: client ↔ team communication

### Tasks:

#### Task 1: Comments system
Implement comments for both project-level and file-level:

**loadComments(projectId, fileId = null):**
- Fetch from client_get_comments
- Render threaded view (parent comments with nested replies)
- Team comments: accent border, "فريق" badge, slightly different bg
- Client comments: neutral border, "عميل" badge
- Each comment: avatar (first letter), author name, badge, relative time, text
- Reply button → inline reply form (textarea + submit)
- New comment form at bottom

**addComment(projectId, fileId):**
- Validate (min 3 chars)
- POST to client_add_comment
- Clear form, reload comments
- Toast confirmation

**addReply(parentId):**
- Same as addComment but with parent_id
- Reply form hides after success

**showReplyForm(commentId):**
- Toggle reply form visibility under that comment
- Smooth slide animation (max-height transition)
- Auto-focus textarea

**markCommentsRead():**
- Called automatically when comments load
- POST to client_mark_comments_read
- Silent — no UI feedback needed

**Wire into existing views:**
- renderProjectDetail: after files list → loadComments(projectId)
- renderFilePreview: after approval section → loadComments(projectId, fileId)

#### Task 2: Notifications page
Implement renderNotifications():
- Page title: "🔔 الإشعارات"
- "قراءة الكل" button (top right)
- List of notifications:
  - Type icon (📄 new_file, 💬 comment_reply, ⏳ approval_reset, 📁 project_status, etc.)
  - Title (bold)
  - Message (secondary)
  - Relative time
  - Unread: accent left border + subtle highlighted bg
- Click notification → mark read + navigate to target project/file
- Empty state: "لا توجد إشعارات"

**Notification badge (nav bar):**
- initNotifications(): start polling
- pollNotifications(): GET client_unread_count every 30s
- Update badge: show count when > 0, hide when 0
- Badge: red circle with number, subtle pulse animation

**markAllNotificationsRead():**
- POST to client_mark_all_read
- Refresh badge and list

**handleNotificationClick(notifId, targetProjectId, targetFileId):**
- POST mark_notif_read (fire-and-forget)
- Navigate to target: file_preview or project_detail

#### Task 3: Team-side notifications
Verify these flows create notifications correctly:
- Client approves file → pyra_notifications record for team (type='client_approval')
- Client requests revision → notification for team with comment preview
- Client adds comment → notification for team
- Team replies (team_reply_to_client) → pyra_client_notifications for client (type='comment_reply')

#### Task 4: Styling
**Comments:**
- Thread layout: parent full-width, replies indented (margin-right 24px in RTL)
- Max nesting: 2 levels (parent → reply, no deeper)
- Team comment: accent-colored left border (RTL: right border), subtle accent bg (5% opacity)
- Client comment: neutral border, neutral bg
- Badges: "فريق" (accent bg 20%), "عميل" (neutral bg)
- Reply form: inline flex, textarea + button, slide animation
- Avatar: first letter in colored circle

**Notifications:**
- List items: icon + content + time, with hover effect
- Unread: accent left border + bg highlight using color-mix or rgba
- Badge: red circle, position absolute on nav button, bounce animation on change
- "قراءة الكل" button: subtle, secondary style

### Testing checklist:
- [ ] Comments load under project detail
- [ ] Comments load under file preview
- [ ] Adding comment works → appears in list
- [ ] Replying works → nested under parent
- [ ] Team vs client styling distinct
- [ ] Reply form toggle works with animation
- [ ] Comment validation (min 3 chars)
- [ ] Notification badge shows correct count
- [ ] Badge updates every 30 seconds
- [ ] Notification list renders correctly
- [ ] Click notification → navigates + marks read
- [ ] "قراءة الكل" works
- [ ] Team notifications created on client actions
- [ ] Client notifications created on team reply
- [ ] XSS: HTML in comment text is escaped
- [ ] RTL: borders on correct side, indentation correct
- [ ] Mobile: comments stack, notifications fullwidth
- [ ] No console errors
- [ ] All previous features work
- [ ] Clean code

### ⚠️ Do NOT:
- Add WebSocket or real-time library (polling is fine for V1)
- Break approval flow from Phase 5
- Skip XSS escaping — CRITICAL
- Nest replies deeper than 2 levels
```

---

## Phase 7: Email Notifications + Profile

```
## Phase 7: Email Notifications + Client Profile Page

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 2.6.5 (Email), 2.7 (Profile)
- Read includes/auth.php — verify sendClientEmail() exists from Phase 2
- Read config.php — check if SMTP settings exist
- Check TOOLS.md — Bayra Email: pyraai@pyramedia.info, SMTP mail.pyramedia.info:465 SSL
- Verify profile endpoints work (client_profile, client_update_profile, client_change_password)

### What to build:
1. HTML email notification system for key events
2. Client profile page (view info, edit, change password)

### Tasks:

#### Task 1: Email template system
Create email helper functions in includes/auth.php (or a new includes/email.php):

**getClientEmailTemplate($title, $message, $actionUrl, $actionText):**
- Returns HTML string (inline CSS only — email-safe)
- RTL layout (dir="rtl")
- Dark theme matching Pyra brand:
  - Outer bg: #1a1a2e
  - Card bg: #111620
  - Accent: #F97316
  - Text: #edf0f7
  - Secondary text: #8892a8
- Pyramedia logo/name header
- Title (h2)
- Message body (paragraph)
- CTA button (accent bg, rounded, bold text)
- Footer: "Pyramedia Workspace — pyramedia.info"

**Enhance sendClientEmail():**
- Try SMTP first (if settings exist): mail.pyramedia.info:465 SSL
- Fallback to PHP mail()
- ALWAYS try/catch — email failure must not break operations
- Log attempt via logActivity() (success or failure)

#### Task 2: Wire email triggers into existing endpoints
Add email sending AFTER main operation succeeds (fire-and-forget):

1. **api.php → manage_clients → create:**
   - Email: "مرحباً في Pyramedia Portal"
   - Content: welcome + login URL (/portal/) + note about password
   
2. **api.php → manage_project_files (when needs_approval=true):**
   - Email to all primary clients in company
   - Subject: "ملف جديد بانتظار موافقتك"
   - Content: file name, project name, link to portal

3. **api.php → team_reply_to_client:**
   - Email to the client being replied to
   - Subject: "رد جديد على تعليقك"
   - Content: reply excerpt, project name, link

4. **portal/index.php → client_forgot_password:**
   - Email with reset link: /portal/?action=reset&token=XXX
   - Subject: "إعادة تعيين كلمة المرور"
   - Token expires in 1 hour

#### Task 3: Profile page
Implement renderProfile():

**Profile card (top):**
- Large avatar: first letter of name, gradient background (accent → #ec4899), 80x80px circle
- Name (large text)
- Company (with lock icon 🔒 — non-editable)
- Email (with lock icon)
- Phone (if exists)
- Role badge (primary/billing/viewer, with lock icon)

**Edit section:**
- Name input (editable, pre-filled)
- Phone input (editable, optional)
- Language selector: العربية / English (dropdown)
- Save button → POST client_update_profile → toast

**Change password section (visually separated):**
- Current password input
- New password input (with strength indicator: red < 8, amber 8-12, green 12+)
- Confirm password input
- Client-side validation:
  - Passwords match
  - Min 8 chars
  - Show/hide toggle
- Submit → POST client_change_password → toast
- Clear inputs on success

#### Task 4: Styling
**Profile:**
- Card layout: avatar + info side by side (stacks on mobile)
- Gradient avatar circle (CSS only)
- Lock icon on non-editable fields (CSS ::after or inline)
- Form sections with clear headings and separation
- Password strength bar (CSS-only, width + color transition)
- Success checkmark animation after save

**Email template:**
- Must render in Gmail, Outlook, Apple Mail
- All CSS inline
- Use table layout for email (email HTML is stuck in 2005)
- Test: send to yourself and verify rendering

### Testing checklist:
- [ ] Profile loads with correct data
- [ ] Name/phone update saves correctly
- [ ] Company, email, role shown as locked
- [ ] Password change: correct current → success
- [ ] Password change: wrong current → error
- [ ] Password validation (min 8, match)
- [ ] Strength indicator updates as you type
- [ ] Email: welcome email sends on client creation
- [ ] Email: approval request email sends
- [ ] Email: team reply email sends
- [ ] Email: password reset email sends
- [ ] Email template renders correctly (check inbox)
- [ ] Email failure doesn't break main operation
- [ ] All previous features work
- [ ] Mobile responsive
- [ ] RTL correct
- [ ] No console errors
- [ ] Clean code

### ⚠️ Do NOT:
- Add PHPMailer — vanilla PHP only
- Make email required — always fire-and-forget
- Store credentials in code — use config.php
- Break any existing functionality
```

---

## Phase 8: Testing + Polish + Final QA

```
## Phase 8: Comprehensive Testing + Visual Polish + Final QA

### Before you start:
- Read `/workspace-analysis/PRD-client-portal.md` — Sections 10 (Rules), 11 (Summary)
- Read ALL portal files: index.php, portal-app.js, portal.css
- Read modified files: includes/auth.php, api.php
- This phase is QUALITY not features — fix, polish, ship

### Tasks:

#### Task 1: Full functional testing — Test EVERY flow:

**1. Authentication:**
- [ ] Valid login → dashboard
- [ ] Wrong password → Arabic error
- [ ] Non-existent email → same generic error (don't leak email existence)
- [ ] Locked account (5 attempts) → lockout message
- [ ] Suspended account → contact admin message
- [ ] Logout → login screen
- [ ] Session persists on page refresh
- [ ] Team session + client session coexist

**2. Dashboard:**
- [ ] All cards load with data
- [ ] Counts are accurate
- [ ] Card clicks navigate correctly
- [ ] Empty state for new client
- [ ] Data refreshes when returning to dashboard

**3. Projects:**
- [ ] Only shows client's company projects
- [ ] Filters work (status)
- [ ] Pagination works
- [ ] Empty state

**4. Project Detail:**
- [ ] Correct project info, progress bar, stats
- [ ] File list complete, sorted by date
- [ ] Filter tabs (category + approval status) work
- [ ] Navigate to file preview works

**5. File Preview:**
- [ ] Image: displays, zoom works
- [ ] PDF: iframe renders
- [ ] Video: plays
- [ ] Audio: plays
- [ ] Other: download placeholder shown
- [ ] Download works all types

**6. Approvals:**
- [ ] Approve: confirm → changes → toast → team notification
- [ ] Revision: form opens → 10 char min → submit → toast → team notification
- [ ] Primary role: sees buttons
- [ ] Billing/viewer: sees status only, no buttons
- [ ] Re-approve after revision possible

**7. Comments:**
- [ ] Add comment works
- [ ] Reply works (nested)
- [ ] Team vs client styled differently
- [ ] XSS attempt: `<script>alert(1)</script>` → displayed as text

**8. Notifications:**
- [ ] Badge count correct
- [ ] Polling updates badge
- [ ] Click → navigate + mark read
- [ ] Mark all read works

**9. Profile:**
- [ ] Data displays correctly
- [ ] Edit name/phone works
- [ ] Password change works
- [ ] Non-editable fields locked

#### Task 2: Security testing

- [ ] **Data isolation:** Client A cannot see Client B's projects (try crafting URL with wrong project_id)
- [ ] **XSS:** Script tags in comments/profile → escaped
- [ ] **CSRF:** POST without token → 403
- [ ] **CSRF:** POST with wrong token → 403
- [ ] **Session:** Expired client session → 401 → redirect to login
- [ ] **Input:** Empty required fields → proper error
- [ ] **Input:** Extremely long text → handled (not crash)
- [ ] **Auth bypass:** API call without login → 401

#### Task 3: Responsive testing (3 viewports)

**Desktop (1440px):**
- [ ] Dashboard: 2-3 column grid
- [ ] Projects: 2-3 column grid
- [ ] Navigation: full

**Tablet (768px):**
- [ ] Dashboard: 1-2 columns
- [ ] Navigation wraps or collapses
- [ ] Preview: iframe/video resize

**Mobile (375px):**
- [ ] Single column everywhere
- [ ] Touch targets ≥ 44px
- [ ] No horizontal scroll
- [ ] Login card: full width
- [ ] User name hidden in nav

#### Task 4: RTL verification
- [ ] All text aligned right
- [ ] Comment borders on LEFT (not right in RTL)
- [ ] Notification unread borders on LEFT
- [ ] Reply indentation uses margin-left (not margin-right)
- [ ] Back button arrow (← correct)
- [ ] Form labels aligned right
- [ ] Progress bar direction correct
- [ ] Filters: RTL order

#### Task 5: Visual polish — Make it PRODUCTION quality

**Loading states:**
- [ ] Skeleton placeholders on all data-loading views
- [ ] Spinners during API calls
- [ ] Buttons disabled during requests (prevent double-click)

**Animations:**
- [ ] Screen transitions smooth
- [ ] Card entrance staggered (50ms delay)
- [ ] Toast: slide in, fade out
- [ ] Notification badge: subtle pulse
- [ ] No janky/stuttering animations

**Error handling:**
- [ ] Network error → friendly Arabic message + retry
- [ ] API error → toast with message
- [ ] 404 content → "غير موجود" with back button

**Typography:**
- [ ] Cairo loads for Arabic
- [ ] Inter loads for English/numbers
- [ ] Headings: 600-700 weight
- [ ] Body: 400
- [ ] Line height: 1.6-1.8 for Arabic

**Colors:**
- [ ] Accent color from settings (dynamic)
- [ ] Status colors consistent
- [ ] Hover states visible
- [ ] Focus states visible (accessibility)

#### Task 6: Code cleanup

**Remove ALL:**
- [ ] console.log() statements
- [ ] Commented-out code
- [ ] TODO comments (do them or remove)
- [ ] Unused functions
- [ ] Duplicate CSS rules
- [ ] Debug variables

**Verify:**
- [ ] All API calls handle failure (try/catch + toast)
- [ ] All user input sanitized (escHtml/escAttr in JS, htmlspecialchars in PHP)
- [ ] All POST endpoints check CSRF
- [ ] All queries filter by client_company/client_id
- [ ] No !important in CSS (unless absolutely necessary)
- [ ] Event handlers clean up (no memory leaks)
- [ ] Notification polling timer uses proper interval reference

**Organize:**
- [ ] CSS sections clearly labeled/commented
- [ ] JS methods grouped logically
- [ ] PHP cases in logical order

#### Task 7: Performance
- [ ] Dashboard loads < 2 seconds
- [ ] No unnecessary API calls
- [ ] Images have `loading="lazy"`
- [ ] Lists paginated
- [ ] CSS animations use transform/opacity (GPU)
- [ ] No memory leaks

### FINAL mega-checklist:
- [ ] Fresh login → full flow works end-to-end
- [ ] Approval flow: project → file → approve → notification
- [ ] Revision flow: file → request → comment → notification
- [ ] Comments: add → reply → threaded view
- [ ] Notifications: receive → badge → click → navigate → read
- [ ] Profile: view → edit → save → password change
- [ ] Security: isolation, XSS, CSRF all verified
- [ ] Mobile: complete flow on 375px
- [ ] RTL: every component correct
- [ ] Zero console errors
- [ ] Zero 404s in Network tab
- [ ] Emails send (if SMTP configured)
- [ ] **ORIGINAL SITE (/) WORKS PERFECTLY — ZERO REGRESSIONS**
- [ ] Code is production-quality

### ⚠️ Final rules:
- NO new features — only fix and polish
- NO refactoring working code for aesthetics
- NO changing API contracts
- Critical bug → fix it. Minor annoyance → fix it. "Nice to have" → skip, V2
- Goal: SHIP IT 🚀
```

---

## ملخص المراحل

| # | المرحلة | الملفات الرئيسية | المدة |
|---|---------|-----------------|-------|
| **0** | تنظيم المشروع | كل الملفات (نقل + تحديث references) | 2-3 ساعات |
| **1** | Database + Supabase | `database/portal-schema.sql` | 2-3 ساعات |
| **2** | API Endpoints | `includes/auth.php`, `portal/index.php`, `api.php` | 4-6 ساعات |
| **3** | Login Page | `portal/index.php`, `portal/assets/css/`, `portal/assets/js/` | 2-3 ساعات |
| **4** | Dashboard | `portal-app.js`, `portal.css` | 3-4 ساعات |
| **5** | Project + Files | `portal-app.js`, `portal.css` | 4-5 ساعات |
| **6** | Comments + Notifications | `portal-app.js`, `portal.css`, `api.php` | 3-4 ساعات |
| **7** | Email + Profile | `includes/auth.php`, `portal-app.js` | 2-3 ساعات |
| **8** | Testing + Polish | كل الملفات | 2-3 ساعات |

**المجموع:** 24-34 ساعة عمل

---

### التقنيات المفتوحة — الخيارات:

| الفئة | الخيارات | ملاحظة |
|-------|---------|--------|
| **CSS** | Tailwind v4 CDN, UnoCSS, Vanilla CSS | الأهم يكون WOW |
| **JS** | Alpine.js, HTMX, Petite-Vue, Vanilla | CDN فقط — بدون build |
| **Animation** | CSS only, Motion One, Auto-Animate | 60fps smooth |
| **Icons** | Heroicons, Lucide, Phosphor | SVG preferred |
| **Fonts** | Cairo + Inter (Google Fonts) | عربي + إنجليزي |

> **تعليمات لمحمد:** انسخ كل أمر (المحتوى داخل الـ code block) والصقه في Claude Code. نفّذ بالترتيب (**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**). لا تنتقل للمرحلة التالية إلا لما الحالية تشتغل 100%.

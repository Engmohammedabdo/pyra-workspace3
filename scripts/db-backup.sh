#!/usr/bin/env bash
#
# pnpm db:backup [<label>]
#
# Pre-migration backup helper (Phase 14.2 Commit 3). Runs pg_dump against
# SUPABASE_DB_URL (from .env.local), restricted to the public schema, with
# data excluded from the two audit-only tables (pyra_error_logs +
# pyra_activity_log — schema retained, data is regenerable). Output is
# gzipped and lands in `backups/` (gitignored).
#
# Examples:
#   pnpm db:backup                  → backups/2026-05-15_142301_manual.sql.gz
#   pnpm db:backup pre-018          → backups/2026-05-15_142301_pre-018.sql.gz
#   pnpm db:backup before-stage-7   → backups/2026-05-15_142301_before-stage-7.sql.gz
#
# Portability:
#   Tested on macOS (zsh + bash), Linux (bash), and Git Bash on Windows.
#   Uses POSIX-compatible patterns only. Required external tools:
#     - pg_dump (PostgreSQL client tools)
#     - gzip (universal — bundled with macOS, Linux, Git Bash)
#     - date, mkdir, du, cut, grep, sed (all POSIX)
#
# Security:
#   - Label arg is regex-validated against [a-zA-Z0-9._-]+ — rejects any
#     value containing $, `, ;, |, &, spaces, ../, etc. Prevents shell
#     injection via crafted label strings.
#   - SUPABASE_DB_URL is read from .env.local ONLY (never from process env
#     or CLI). Same discipline as the TypeScript scripts: secrets stay in
#     the file, shell history never sees them.

set -euo pipefail

# ─── 1. Validate + sanitize the label arg ──────────────────────────────────

LABEL="${1:-manual}"

# Regex-validate. Allowed: alphanumerics + dot + underscore + hyphen.
# Rejects spaces, $, `, ;, |, &, /, parens, brackets — anything a shell
# could interpret as code OR a filesystem path traversal.
if ! [[ "$LABEL" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "❌ Invalid label: '${LABEL}'" >&2
  echo "   Labels must match [a-zA-Z0-9._-]+ (alphanumerics, dot, underscore, hyphen)." >&2
  echo "   Rejected: spaces, shell metacharacters (\$, \`, ;, |, &), slashes, ../, etc." >&2
  echo "" >&2
  echo "   Examples of valid labels:" >&2
  echo "     pre-018" >&2
  echo "     before-stage-7-approval" >&2
  echo "     hotfix.2026-05-15" >&2
  exit 1
fi

# Belt-and-braces: also reject any label containing '..' (the regex above
# blocks this via the missing '/' but '..' alone is the form path traversal
# would take if dots/hyphens were ever loosened in the regex).
if [[ "$LABEL" == *".."* ]]; then
  echo "❌ Invalid label: '${LABEL}' (contains '..')." >&2
  exit 1
fi

# ─── 2. Verify pg_dump is available ────────────────────────────────────────

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "❌ pg_dump not found on PATH." >&2
  echo "" >&2
  echo "   Install instructions (per docs/MIGRATIONS.md §14):" >&2
  echo "     macOS:   brew install libpq && brew link --force libpq" >&2
  echo "     Linux:   apt install postgresql-client  (or distro equivalent)" >&2
  echo "     Windows: install PostgreSQL for Windows from postgresql.org," >&2
  echo "              then add C:\\Program Files\\PostgreSQL\\<ver>\\bin to PATH." >&2
  echo "              Use Git Bash (not PowerShell) when running this script." >&2
  exit 1
fi

# ─── 3. Read SUPABASE_DB_URL from .env.local ───────────────────────────────

ENV_FILE=".env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ ${ENV_FILE} not found in cwd." >&2
  echo "   Run this script from the repo root." >&2
  exit 1
fi

# Extract SUPABASE_DB_URL, strip surrounding quotes if present (same pattern
# as docs/MIGRATIONS.md §5.1 Bash export).
DB_URL=$(grep '^SUPABASE_DB_URL=' "$ENV_FILE" | head -n 1 | cut -d'=' -f2- | sed -e 's/^["'"'"']\(.*\)["'"'"']$/\1/' || true)

if [ -z "$DB_URL" ]; then
  echo "❌ SUPABASE_DB_URL not set in ${ENV_FILE}." >&2
  echo "" >&2
  echo "   Add a line like:" >&2
  echo "     SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require" >&2
  echo "" >&2
  echo "   The <host> is the Postgres host of the self-hosted Supabase stack" >&2
  echo "   (NOT pyraworkspacedb.pyramedia.cloud, which fronts Kong → Postgres)." >&2
  echo "   Get the connection string from Coolify → Supabase stack → Postgres service." >&2
  exit 1
fi

# ─── 4. Prepare output ─────────────────────────────────────────────────────

mkdir -p backups
TS=$(date -u +%Y-%m-%d_%H%M%S)
OUT="backups/${TS}_${LABEL}.sql.gz"

# ─── 5. Run pg_dump → gzip ─────────────────────────────────────────────────
#
# Flags:
#   --no-owner          Skip ownership SET — restoring into a different
#                       cluster (staging, dev) won't fail on user mismatch
#   --no-acl            Skip GRANT/REVOKE — same reasoning
#   --schema=public     Pyra owns only the `public` schema. Supabase
#                       platform schemas (auth, storage, realtime, etc.) are
#                       managed independently and don't belong in our dump
#   --exclude-table-data
#                       Excludes ROW DATA for the two audit-only tables but
#                       keeps their schema (CREATE TABLE statements still
#                       included in the dump). Audit data is regenerable
#                       (errors will accumulate again post-restore; activity
#                       log is operational telemetry, not business data)
#                       and excluding them shrinks the dump significantly
#                       on long-lived production DBs.

echo "→ Running pg_dump …"

pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --schema=public \
  --exclude-table-data='pyra_error_logs' \
  --exclude-table-data='pyra_activity_log' \
  | gzip > "$OUT"

# ─── 6. Report ─────────────────────────────────────────────────────────────

SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✅ Backup written: ${OUT}"
echo "   Size: ${SIZE}"
echo ""
echo "ℹ️  Backup excludes row data from pyra_error_logs + pyra_activity_log"
echo "   (audit tables — schema retained, data is regenerable). All other"
echo "   public schema data is included."
echo ""
echo "   Restore command (verify the file path first):"
echo "     gunzip -c ${OUT} | psql \"\$SUPABASE_DB_URL\""

# Pyra Workspace — DB Migrations Runbook

> **Phase 14.2 deliverable.** Operational guide for adding, applying, and tracking schema migrations against the self-hosted Supabase Postgres at `pyraworkspacedb.pyramedia.cloud`.

---

## 1. Overview

The Pyra Workspace uses **forward-only, file-numbered, plain-SQL migrations** applied via `curl POST /pg/query` against the self-hosted Supabase instance. There is **no Supabase CLI** wiring, **no GitHub Actions** pipeline, **no ORM-managed migrations**.

| Aspect | Choice | Why |
|---|---|---|
| Migration files | `supabase/migrations/NNN_<topic>.sql` | Chronological, human-readable diff |
| Apply method | Manual `curl /pg/query` with `SUPABASE_SERVICE_ROLE_KEY` | Self-hosted Supabase exposes the SQL endpoint via Kong; no CLI needed |
| Rollback | **Forward-only** + `pg_dump` restore as last resort | Auto-down migrations are dangerous (irreversible data loss). Industry trend (Rails 7+, Prisma) is the same. |
| Version tracking | `pyra_schema_migrations` table (Phase 14.2 Commit 2 onward) | Drift detection + audit trail |
| Idempotency | `IF NOT EXISTS` / `IF EXISTS` on every DDL; `ON CONFLICT DO NOTHING` on every backfill | Safe to re-apply on populated DB |
| Backup tooling | `pnpm db:backup` → Bash `pg_dump` + gzip → `backups/` (gitignored) | Single-step rollback insurance |
| Staging environment | **Deferred to v1.1** | 32 MB DB + 1-dev workflow + high idempotency hygiene = staging-shaped cost without proportional benefit. v1.1 trigger: destructive migration OR second developer joining. |

---

## 2. Naming convention

`supabase/migrations/NNN_<lowercase_topic_with_underscores>.sql`

- `NNN` — zero-padded sequence number (e.g. `017`). **Next migration's number = (highest existing) + 1.**
- `<topic>` — 2-6 words, lowercase, words separated by underscores. Describe what the migration does, not why.
  - ✅ `017_pyra_schema_migrations.sql`
  - ✅ `015_pyra_error_logs.sql`
  - ✅ `010_crm_remap_leads.sql`
  - ❌ `017-schema-migrations.sql` (hyphens — inconsistent with existing chain)
  - ❌ `017_phase_14_2.sql` (topic should describe DDL, not phase)

The number gap at `001` is filled by `001_employee_system_bootstrap.sql` (Phase 14.2 Commit 2 — formerly `scripts/migration-employee-system.sql`).

---

## 3. Writing a migration

1. Copy the template:
   ```bash
   cp supabase/migrations/_template.sql supabase/migrations/NNN_topic.sql
   ```
2. Fill the **header comment block** completely. Every field matters for the audit trail.

   **Valid `Phase` values** (use one — keep consistent across the codebase):
   | Phase value | When to use |
   |---|---|
   | `"14.2 Commit 2"` | Multi-commit phase — include the commit number |
   | `"15.1"` | Single-commit phase — phase number alone |
   | `"hotfix"` | Unplanned production fix; not part of a numbered phase |
   | `"bootstrap"` | Retroactive recording OR fresh-DB-only migration (currently only `001_employee_system_bootstrap.sql`) |

3. Wrap **every** DDL statement in idempotency guards:
   - `CREATE TABLE IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   - `ALTER TABLE ... DROP COLUMN IF EXISTS` (only when intentionally destructive — see §11)
   - `DROP TRIGGER IF EXISTS` (required before `CREATE TRIGGER` since triggers don't support `OR REPLACE`)
4. Any data backfill must be idempotent. See §5.5 for the canonical patterns.
5. Leave the `-- DOWN` block as informational hints — never executed by tooling.

---

## 4. Pre-flight checklist

Before applying a new migration:

- [ ] `pnpm db:check-drift` is clean (no missing rows, no checksum mismatches in `pyra_schema_migrations`).
- [ ] Header comment block fully populated.
- [ ] Every DDL statement has `IF NOT EXISTS` / `IF EXISTS`.
- [ ] If `Touches data: YES` → backfill is idempotent (verified by mental re-apply).
- [ ] If `Risk tier: 2` → `pnpm db:backup pre-NNN` produces a snapshot, file visible in `backups/`.
- [ ] Manual-verification query is drafted (see §6) — what SELECT will prove the migration worked?
- [ ] Linked Phase doc / issue ref noted in the header.

---

## 5. Applying a migration

### 5.1 Environment

You need `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` exported into your shell:

```bash
# Bash / Git Bash — strips surrounding quotes if present
# (defensive: standard .env files vary on whether values are quoted;
# the `xargs`-based one-liner you'll see in older Pyra commits assumed
# unquoted values and silently corrupts the JWT when quotes are present)
export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d'=' -f2- | tr -d "\"'")
```

```powershell
# PowerShell
$env:SUPABASE_SERVICE_ROLE_KEY = (Get-Content .env.local | Select-String 'SUPABASE_SERVICE_ROLE_KEY' | ForEach-Object { (($_ -split '=', 2)[1]).Trim('"', "'") })
```

Verify the export succeeded:
```bash
echo ${#SUPABASE_SERVICE_ROLE_KEY}   # Bash — should print > 100 (typical JWT length)
```
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY.Length   # PowerShell — same expectation
```

### 5.2 Apply via `curl`

The Pyra workflow encodes the SQL as a JSON payload (Python is convenient for the encoding step because it handles multiline strings + escapes cleanly):

```bash
python3 -c "
import json
with open('supabase/migrations/NNN_topic.sql', 'r', encoding='utf-8') as f:
  sql = f.read()
print(json.dumps({'query': sql}))
" > /tmp/migration_NNN.json

curl -sS -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  --data-binary @/tmp/migration_NNN.json
```

A successful DDL response is `[]` (empty array). A failure returns a structured error with `"error"` and SQLSTATE code.

---

## 5.5 Common migration patterns

These four patterns cover ~90% of the migrations Pyra will need. **Always prefer the multi-step pattern over a single destructive statement** — even on tiny tables. It costs nothing and trains the habit for when a table is no longer tiny.

### 5.5.1 Adding a `NOT NULL` column to a populated table

Single-statement attempt would fail on existing rows (no default → can't satisfy NOT NULL). Split into three steps:

```sql
-- Step 1 — add as NULL-able
ALTER TABLE pyra_<table>
  ADD COLUMN IF NOT EXISTS <col> text;

-- Step 2 — idempotent backfill (WHERE IS NULL means re-apply is safe)
UPDATE pyra_<table>
SET    <col> = '<sensible default>'
WHERE  <col> IS NULL;

-- Step 3 — apply the NOT NULL constraint after all rows have a value
ALTER TABLE pyra_<table>
  ALTER COLUMN <col> SET NOT NULL;
```

Splitting prevents downtime on large tables (each statement is independent + interruptible). On small tables it's the same outcome with negligible overhead — but the habit matters.

### 5.5.2 Adding a `CHECK` constraint to existing data

A direct `ADD CONSTRAINT` rejects the entire migration if even one existing row violates the predicate. Two safer paths:

**(a) Pre-check + direct add (small tables, confident data):**
```sql
-- Manual pre-check before writing the migration:
--   SELECT COUNT(*) FROM pyra_<table> WHERE NOT (<constraint expr>);
-- Expect 0. If non-zero, write a backfill step FIRST.

ALTER TABLE pyra_<table>
  ADD CONSTRAINT pyra_<table>_<col>_check CHECK (<constraint expr>);
```

**(b) `NOT VALID` + asynchronous `VALIDATE` (large tables, less downtime):**
```sql
-- Step 1 — apply the constraint to NEW rows immediately; skip the
-- existing-rows full-table scan (no exclusive lock)
ALTER TABLE pyra_<table>
  ADD CONSTRAINT pyra_<table>_<col>_check CHECK (<constraint expr>) NOT VALID;

-- Step 2 — validate existing rows (acquires a SHARE UPDATE lock, not
-- AccessExclusive — read/write traffic continues)
ALTER TABLE pyra_<table>
  VALIDATE CONSTRAINT pyra_<table>_<col>_check;
```

If Step 2 reports failure, your existing data violates the constraint — you need a backfill migration before re-running VALIDATE.

### 5.5.3 Adding a foreign key to existing data

Same shape as CHECK. Direct add scans + locks the whole table. Prefer `NOT VALID` + `VALIDATE CONSTRAINT` for tables > ~10k rows:

```sql
-- Step 1 — applies to new rows, no full scan
ALTER TABLE pyra_<child>
  ADD CONSTRAINT pyra_<child>_<col>_fkey
  FOREIGN KEY (<col>) REFERENCES pyra_<parent>(id)
  ON DELETE <CASCADE|SET NULL|RESTRICT> NOT VALID;

-- Step 2 — validate existing rows
ALTER TABLE pyra_<child>
  VALIDATE CONSTRAINT pyra_<child>_<col>_fkey;
```

For small tables, a single `ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE ...` is fine — but only when you've already verified parent-side coverage.

### 5.5.4 Dropping a column safely (forward-only)

Multi-step over multiple deploys:

1. **Audit app code for references:**
   ```bash
   # Search Pyra code for the column name. ripgrep's built-in `ts` type
   # matches BOTH .ts and .tsx — there is no separate `tsx` built-in.
   rg "column_name" --type ts
   rg "column_name" supabase/
   ```
2. **Deploy code that no longer reads or writes the column.** The migration that drops the column comes AFTER this deploy.
3. **Apply the dropping migration:**
   ```sql
   ALTER TABLE pyra_<table>
     DROP COLUMN IF EXISTS <col>;
   ```
4. **Verify no errors land in `pyra_error_logs` for 1-2 days.** If a code path still references the column, it'll surface as a Postgres `column does not exist` error in the Phase 14.1 observability table.

Skipping step 1 or 2 risks production errors. Skipping step 4 risks silent feature breakage.

---

## 6. Manual verification step (mandatory before recording)

**Do NOT run `pnpm db:record` until you've verified the migration actually worked.** `pyra_schema_migrations` is a historical record, not a confirmation of success — recording a row without verifying creates fake success entries that drift detection trusts.

For every migration, draft a verification query in the header comment, then run it after the apply step:

```sql
-- Migration 015 example: verify table + indexes + CHECK constraints
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'pyra_error_logs') AS columns,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'pyra_error_logs') AS indexes,
  (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'pyra_error_logs'::regclass AND contype = 'c') AS checks;
-- Expect: 16 columns, 4 indexes (3 + primary key), 2 CHECK constraints

-- Migration 010 example: verify backfill ran on all eligible rows
SELECT
  COUNT(*) FILTER (WHERE legacy_stage_id IS NOT NULL) AS migrated_rows,
  COUNT(*) FILTER (WHERE legacy_stage_id IS NULL)    AS unmigrated_rows
FROM pyra_sales_leads;
-- Expect: unmigrated_rows = 0
```

Run via the same `curl /pg/query` pattern from §5.2. Confirm the result matches your expected state before proceeding to §7.

---

## 7. Recording in `pyra_schema_migrations`

After verification passes:

```bash
# Records the migration with the caller's username + LF-normalized SHA-256
pnpm db:record 017_pyra_schema_migrations --by=abdou --notes="initial bootstrap of version tracking"
```

Flags:
- `--by=<username>` — overrides the `ABDOU_USERNAME` env var. Defaults to `'system'` if neither is set.
- `--notes="<text>"` — optional human-readable note (e.g. "rollback of 016 attempt 2").

The script:
1. Reads the migration file at `supabase/migrations/<arg>.sql`.
2. Normalizes line endings to LF: `content.replace(/\r\n/g, '\n')`.
3. Computes `SHA-256` of the normalized content.
4. Inserts a row into `pyra_schema_migrations` via the service-role key (read from `.env.local` only — never from CLI for security).
5. Prints the inserted row for verification.

---

## 8. Drift detection

```bash
pnpm db:check-drift
```

Reports three categories of inconsistency between the recorded versions and the on-disk files:

| Symbol | Meaning | What to do |
|---|---|---|
| `❌ DRIFT` | File exists, recorded row exists, checksums don't match → file was edited POST-apply | Restore file content OR write a new migration; **never** silently re-record |
| `⚠️ MISSING` | File exists in `supabase/migrations/`, no row in table | Run `pnpm db:record NNN_topic` after verifying it was actually applied |
| `🗑️ ORPHAN` | Row exists in table, no matching file on disk | File was deleted; review git history before deciding (might be a renamed file → rename row too) |

**Line-ending invariant:** checksums are computed on LF-normalized content (`\r\n` → `\n`). On Windows the working tree may store CRLF after `git checkout`, but drift detection treats CRLF and LF as equivalent. Documented here so future debugging doesn't chase a phantom mismatch.

---

## 9. Fresh database setup

For staging, development sandboxes, or disaster-recovery rebuild:

1. **Apply all migrations in order:** `001` → `002` → ... → highest existing.
2. **Each via the §5.2 `curl` flow** with the service-role key for the target DB.
3. **After 017 has been applied**, `pyra_schema_migrations` is an empty table — you must record each migration retroactively. There is no `db:bootstrap` wrapper in v1; do it via a loop:
   ```bash
   for migration in supabase/migrations/0*.sql; do
     name=$(basename "$migration" .sql)
     pnpm db:record "$name" --by=bootstrap --notes="fresh-DB recording"
   done
   ```
   (`0*.sql` glob matches `001`-`099` — extend the glob when the project crosses 100 migrations.)

A `pnpm db:bootstrap` one-shot wrapper is in the v1.1 backlog.

---

## 10. Backup procedure

**Always run before applying any migration at `Risk tier: 2`.** Highly recommended before tier-1 migrations too — the cost is trivial (32 MB DB → ~5 MB compressed).

```bash
pnpm db:backup pre-017
# Output: backups/2026-05-15_142301_pre-017.sql.gz
```

The script:
1. Reads `SUPABASE_DB_URL` from `.env.local`.
2. Runs `pg_dump --no-owner --no-acl --schema=public` (public schema only — Supabase platform schemas are managed independently).
3. Excludes **data** (not schema) from `pyra_error_logs` and `pyra_activity_log` — both are audit-only, regenerable, and would bloat the dump without value.
4. Pipes through `gzip` → `backups/YYYY-MM-DD_HHMMSS_<label>.sql.gz`.
5. Prints the file path + compressed size.

**Restore:**
```bash
gunzip -c backups/2026-05-15_142301_pre-017.sql.gz \
  | psql "$SUPABASE_DB_URL"
```

Backups land in `backups/` which is `.gitignore`-d. **Offsite storage is Abdou's choice** — current v1 has no automated offsite. v1.1 backlog includes an S3-compatible push (Coolify ships with object-storage integration).

---

## 11. Rollback strategy

Pyra is **forward-only**. There is no `_down.sql` file, no automated rollback tooling. To revert a migration:

| Scenario | Action |
|---|---|
| DDL-only migration, no data changed | Write a new migration NNN+1 that reverses the DDL (e.g. `DROP COLUMN IF EXISTS new_col`) |
| Data backfill mistake, schema unchanged | Write a new migration that UPDATEs the affected rows to their correct values (if known) |
| Catastrophic failure (table corrupted, data deleted) | Restore from the `pnpm db:backup pre-NNN` snapshot via §10's restore command |
| File edited post-apply (drift detected) | **Don't silently re-record.** Either revert the file edit (preserves history) OR write a new migration that achieves the additional change cleanly |

The inline `-- DOWN` block in each migration is documentation, not executable. Never paste it into pg/query as a rollback step — verify each line against current production state first.

---

## 12. Concurrent migration protection

**v1 trusts the single-developer workflow.** If two developers apply migrations simultaneously (which would be rare given the 1-dev codebase), `pyra_schema_migrations` could end up with both rows but the SQL apply order is unpredictable. There is no advisory lock in v1.

**v1.1 will add:**
```ts
// Pseudocode for db-record-migration.ts upgrade
await supabase.rpc('pg_advisory_lock', { key: hashCode('pyra_migrations') });
try {
  // ... insert row ...
} finally {
  await supabase.rpc('pg_advisory_unlock', { key: hashCode('pyra_migrations') });
}
```

Until then: if you're working with a peer, coordinate via Slack/DM before applying any migration.

---

## 13. Apply order enforcement

`pyra_schema_migrations` does **not** enforce that migration 019 is applied before 020. The numbers are advisory; the system trusts the developer to apply in order.

**Why not enforce?** Adding a `BEFORE INSERT` trigger that checks `version - 1 exists` would block retroactive recording (Phase 14.2 backfill of 001-016 would fail) and break the bootstrap flow. Out-of-order recording is rare enough that v1 accepts the risk.

**v1.1 will add** an order-gap warning to `pnpm db:check-drift`: if version 020 exists in the table but 019 doesn't, the script prints a warning (but doesn't fail).

---

## 14. Windows + Git Bash requirements

The Bash backup script (`scripts/db-backup.sh`) is portable across macOS, Linux, and **Git Bash on Windows**.

Requirements:
- `pg_dump` available on PATH. Verify with `pg_dump --version`.
  - macOS: `brew install libpq && brew link --force libpq` (provides `pg_dump` without the full Postgres server)
  - Linux: `apt install postgresql-client` (or distro equivalent)
  - **Windows:** install [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) (the Windows installer includes `pg_dump.exe`). Add `C:\Program Files\PostgreSQL\<version>\bin` to PATH. Use **Git Bash** as the shell — not PowerShell — when running `pnpm db:backup`. The script uses POSIX shell features (set -euo pipefail, pipes, mkdir -p) that work in Git Bash.
- `gzip` available — bundled with Git Bash on Windows; comes with macOS and Linux by default.

The TypeScript scripts (`db-record-migration.ts`, `db-check-drift.ts`) run via `tsx` and are fully cross-platform (no shell-specific code).

---

## 15. Operations

### 15.1 Scheduled cron jobs

Pyra runs operational cron via **n8n workflows** (self-hosted at
`https://n8n.pyramedia.info`). Each workflow uses a Schedule Trigger
node + HTTP Request node hitting an endpoint under `/api/cron/*`.

| Endpoint | Schedule | Permission key | What it does |
|---|---|---|---|
| `POST /api/cron/follow-up-reminders` | every 5 min | `cron.follow-up-reminders` | Sends WhatsApp reminders to assigned agents for due follow-ups (Phase 11) |
| `POST /api/cron/lead-idle-check` | daily | `cron.lead-idle-check` | Per-agent grouped notifications for stale-deal warnings (Phase 11) |
| `POST /api/cron/error-logs-cleanup` | `0 3 * * *` (daily 03:00 Dubai) | `cron.error-logs-cleanup` | Deletes `pyra_error_logs` rows older than 90 days (Phase D Commit 3) |

**Auth pattern (all cron endpoints):**
```
POST https://workspace.pyramedia.cloud/api/cron/<name>
Header: x-api-key: <key from pyra_api_keys with the required permission>
```

The n8n workflow stores the API key in a credential — never hardcoded in
the workflow itself. To rotate: generate a new key in `/dashboard/admin/
api-keys` with the same permissions, update the n8n credential, then
deactivate the old key.

**Setting up a new cron workflow:**
1. n8n → Workflows → New
2. Add Schedule Trigger (set cron expression)
3. Add HTTP Request node:
   - Method: POST
   - URL: `https://workspace.pyramedia.cloud/api/cron/<name>`
   - Authentication: Header Auth → `x-api-key` = `{{ $credentials.pyraCronKey }}`
4. Activate the workflow

v1.1 backlog: a workflow registry doc tracking which n8n workflow ID
corresponds to which endpoint.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl: (52) Empty reply from server` | `pg/query` endpoint rejected the request; check `apikey` header is set | Re-export `SUPABASE_SERVICE_ROLE_KEY` |
| `ERROR: 42501: must be owner of table` | Service-role key isn't being sent; you're hitting the endpoint anonymously | Verify the `-H "apikey: $..."` line, ensure the env var is non-empty |
| `ERROR: 42P07: relation "..." already exists` | Re-applying a migration that's missing the `IF NOT EXISTS` guard | Edit the migration to add the guard; safe to re-run |
| Drift detected after `git pull` | Line endings in the file were re-normalized by git's `core.autocrlf` setting | Drift check is LF-normalized; if it still flags, run `pnpm db:check-drift -v` for byte-by-byte diff |
| `pg_dump: connection to server failed` | `SUPABASE_DB_URL` not set or wrong format | Format: `postgresql://postgres:<password>@<host>:5432/postgres?sslmode=require` |
| Migration applied but `pnpm db:record` reports "already exists" | Migration was recorded twice OR the file checksum changed between applies | Run `pnpm db:check-drift` to see what's in the table; if checksum mismatch is intentional, write a new migration to formalize the change |

For anything not covered here, check `pyra_error_logs` (admin viewer at `/dashboard/admin/error-logs`) — Phase 14.1 captures most server-side errors with full stack traces and request context.

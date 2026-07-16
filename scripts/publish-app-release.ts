#!/usr/bin/env tsx
/**
 * pnpm app:publish <apk-path> [--notes "..."] [--app pyra-calls|pyra-calls-e2e]
 *                              [--code N --name X] [--by <username>]
 * pnpm app:publish --activate <version_code> [--app pyra-calls|pyra-calls-e2e]
 *                              [--by <username>]
 *
 * Publishes a new Pyra Calls Android APK release into `pyra_app_releases`
 * (migration 039), or reactivates a previous release row (rollback mode).
 * Plan: docs/superpowers/plans/2026-07-16-calls-app-v12-selfupdate-observability.md
 *
 * Publish flow:
 *   1. Parse args (--app defaults to 'pyra-calls').
 *   2. Detect version_code/version_name via aapt2 (or --code/--name override).
 *   3. Compute sha256 + size_bytes of the APK.
 *   4. Fetch the app's current active release; refuse if version_code is not
 *      strictly greater than the active one.
 *   5. Upload the APK to the private `pyra-private` bucket FIRST.
 *   6. ONLY THEN deactivate the current active row, then insert the new row
 *      as active. If the insert fails after deactivation, the exact
 *      `--activate` recovery command is printed — the fleet never sits with
 *      more than one row in an inconsistent active state, and a human can
 *      always run one command to restore the previous version.
 *
 * Rollback flow (--activate N):
 *   Verifies a row exists for (app, version_code=N), deactivates whatever is
 *   currently active, activates row N. No upload, no storage writes.
 *
 * Security: SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) are read
 * from .env.local ONLY — never from process.env or CLI args. Same discipline
 * as scripts/db-record-migration.ts.
 */

import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = '.env.local';
const BUCKET = 'pyra-private';
const CHANNELS = ['pyra-calls', 'pyra-calls-e2e'] as const;
type Channel = (typeof CHANNELS)[number];

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function usage(): never {
  console.log(`
Usage:
  pnpm app:publish <apk-path> [--notes "..."] [--app pyra-calls|pyra-calls-e2e] [--code N --name X] [--by <username>]
  pnpm app:publish --activate <version_code> [--app pyra-calls|pyra-calls-e2e] [--by <username>]
`);
  process.exit(1);
}

// ── .env.local reader ───────────────────────────────────────────────────────

function readEnvValue(key: string): string {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} not found — run from the repo root.`);
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) fail(`${key} not found in ${ENV_FILE}.`);
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function readServiceRoleKey(): string {
  const key = readEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  if (key.length < 100) {
    fail(`SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE} looks malformed (length ${key.length}).`);
  }
  return key;
}

function readSupabaseUrl(): string {
  // readEnvValue() calls fail() → process.exit(1) on a missing key, which
  // terminates the process directly (not a throw) — so there is no
  // catchable fallback path here, intentionally: NEXT_PUBLIC_SUPABASE_URL is
  // a required, non-secret config value, same as SUPABASE_SERVICE_ROLE_KEY.
  const url = readEnvValue('NEXT_PUBLIC_SUPABASE_URL');
  if (!url.startsWith('https://')) {
    fail(`NEXT_PUBLIC_SUPABASE_URL in ${ENV_FILE} looks malformed: "${url}".`);
  }
  return url.replace(/\/$/, '');
}

// ── CLI parsing ──────────────────────────────────────────────────────────────

interface PublishArgs {
  mode: 'publish';
  apkPath: string;
  app: Channel;
  notes: string | null;
  code: number | null;
  name: string | null;
  by: string;
}
interface ActivateArgs {
  mode: 'activate';
  versionCode: number;
  app: Channel;
  by: string;
}

function parseArgs(argv: string[]): PublishArgs | ActivateArgs {
  const args = argv.slice(2);
  if (args.length === 0) usage();

  let app = 'pyra-calls';
  let notes: string | null = null;
  let code: number | null = null;
  let name: string | null = null;
  let by = 'abdou';
  let activateCode: number | null = null;
  let positional: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--activate') {
      const v = args[++i];
      if (!v || Number.isNaN(Number(v))) fail('--activate requires a numeric version_code.');
      activateCode = Number(v);
    } else if (a === '--app') {
      const v = args[++i];
      if (!v) fail('--app requires a value.');
      app = v;
    } else if (a === '--notes') {
      const v = args[++i];
      if (v === undefined) fail('--notes requires a value.');
      notes = v;
    } else if (a === '--code') {
      const v = args[++i];
      if (!v || Number.isNaN(Number(v))) fail('--code requires a numeric version_code.');
      code = Number(v);
    } else if (a === '--name') {
      const v = args[++i];
      if (!v) fail('--name requires a value.');
      name = v;
    } else if (a === '--by') {
      const v = args[++i];
      if (!v) fail('--by requires a value.');
      by = v;
    } else if (!a.startsWith('--')) {
      if (positional === null) positional = a;
    } else {
      fail(`Unknown flag: ${a}`);
    }
  }

  if (!(CHANNELS as readonly string[]).includes(app)) {
    fail(`Invalid --app "${app}". Must be one of: ${CHANNELS.join(', ')}`);
  }

  if (activateCode !== null) {
    return { mode: 'activate', versionCode: activateCode, app: app as Channel, by };
  }

  if ((code !== null) !== (name !== null)) {
    fail('--code and --name must be provided together.');
  }
  if (!positional) usage();

  return { mode: 'publish', apkPath: positional, app: app as Channel, notes, code, name, by };
}

// ── aapt2 discovery + version detection ─────────────────────────────────────

function compareVersionDirs(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function findAapt2(): string | null {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
  ].filter((r): r is string => !!r);

  const seen = new Set<string>();
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    const buildToolsDir = join(root, 'build-tools');
    if (!existsSync(buildToolsDir)) continue;

    let versions: string[];
    try {
      versions = readdirSync(buildToolsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((v) => existsSync(join(buildToolsDir, v, 'aapt2.exe')));
    } catch {
      continue;
    }
    if (versions.length === 0) continue;

    versions.sort((a, b) => compareVersionDirs(b, a));
    return join(buildToolsDir, versions[0], 'aapt2.exe');
  }
  return null;
}

function detectVersionFromApk(
  apkPath: string,
  aapt2Path: string,
): { versionCode: number; versionName: string; badgingOutput: string } {
  let out: string;
  try {
    out = execFileSync(aapt2Path, ['dump', 'badging', apkPath], { encoding: 'utf8' });
  } catch (err) {
    fail(`aapt2 failed to read APK badging: ${err instanceof Error ? err.message : String(err)}`);
  }
  const m = out.match(/versionCode='(\d+)' versionName='([^']+)'/);
  if (!m) fail(`Could not parse versionCode/versionName from aapt2 output for ${apkPath}.`);
  return { versionCode: Number(m[1]), versionName: m[2], badgingOutput: out };
}

// ── Production-channel safety guards ─────────────────────────────────────────
// Only enforced for the "pyra-calls" channel (real fleet), only when aapt2
// badging output is available (the --code/--name override bypasses these —
// see the loud warning printed at the call site). A debug-signed or
// wrong-package APK published to prod would silently fail to install on
// every phone in the fleet (signature mismatch, no telemetry) while still
// bumping the "active release" — the fleet would be stuck notified of an
// update it can never apply.

const EXPECTED_PACKAGE_NAME = 'cloud.pyramedia.calls';

function enforceProductionSafetyGuards(app: Channel, badgingOutput: string): void {
  if (app !== 'pyra-calls') return;

  if (/application-debuggable/.test(badgingOutput)) {
    fail(
      'Refusing to publish: this APK is DEBUG-signed/debuggable (aapt2 badging output contains ' +
        '"application-debuggable"). A debug-signed APK published to the "pyra-calls" production ' +
        'channel would notify the whole fleet of an update, but every device would silently reject ' +
        'the install (signature mismatch) with no telemetry to explain why. Build a release APK, or ' +
        'publish this one to --app pyra-calls-e2e instead.',
    );
  }

  const pkgMatch = badgingOutput.match(/package: name='([^']+)'/);
  const pkgName = pkgMatch?.[1];
  if (pkgName !== EXPECTED_PACKAGE_NAME) {
    fail(
      `Refusing to publish: APK package name is "${pkgName ?? '(not found in aapt2 output)'}", ` +
        `expected "${EXPECTED_PACKAGE_NAME}" for the "pyra-calls" production channel.`,
    );
  }
}

// ── SHA-256 (streamed) ───────────────────────────────────────────────────────

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// ── ID generator: rel_ + 16 base36 chars ────────────────────────────────────
// Not a secret — a collision-resistant-enough PK for a low-volume admin
// table. One random byte per output char (mild modulo bias, irrelevant here).

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function generateReleaseId(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += BASE36[bytes[i] % 36];
  return `rel_${out}`;
}

// ── Supabase REST + Storage helpers ─────────────────────────────────────────

interface ReleaseRow {
  id: string;
  version_code: number;
  version_name: string;
  is_active?: boolean;
}

function restHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

async function getActiveRelease(
  supabaseUrl: string,
  serviceKey: string,
  app: string,
): Promise<ReleaseRow | null> {
  const url = `${supabaseUrl}/rest/v1/pyra_app_releases?app=eq.${encodeURIComponent(app)}&is_active=is.true&select=id,version_code,version_name`;
  const res = await fetch(url, { headers: restHeaders(serviceKey) });
  if (!res.ok) fail(`REST GET (active release) failed: HTTP ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as ReleaseRow[];
  return rows[0] ?? null;
}

async function getReleaseByVersionCode(
  supabaseUrl: string,
  serviceKey: string,
  app: string,
  versionCode: number,
): Promise<ReleaseRow | null> {
  const url = `${supabaseUrl}/rest/v1/pyra_app_releases?app=eq.${encodeURIComponent(app)}&version_code=eq.${versionCode}&select=id,version_code,version_name,is_active`;
  const res = await fetch(url, { headers: restHeaders(serviceKey) });
  if (!res.ok) fail(`REST GET (by version_code) failed: HTTP ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as ReleaseRow[];
  return rows[0] ?? null;
}

async function deactivateActive(supabaseUrl: string, serviceKey: string, app: string): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/pyra_app_releases?app=eq.${encodeURIComponent(app)}&is_active=is.true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...restHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ is_active: false }),
  });
  if (!res.ok) fail(`Failed to deactivate current active release: HTTP ${res.status}: ${await res.text()}`);
}

async function activateReleaseById(
  supabaseUrl: string,
  serviceKey: string,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; text: string }> {
  const url = `${supabaseUrl}/rest/v1/pyra_app_releases?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...restHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ is_active: true }),
  });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text() };
  return { ok: true };
}

async function uploadApk(
  supabaseUrl: string,
  serviceKey: string,
  storagePath: string,
  buffer: Buffer,
): Promise<void> {
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...restHeaders(serviceKey),
      'Content-Type': 'application/vnd.android.package-archive',
      'x-upsert': 'false',
    },
    // Node's Buffer is structurally a Uint8Array at runtime (undici accepts
    // it directly as a BodyInit); the DOM lib's fetch() typings don't see
    // through the @types/node Buffer<ArrayBufferLike> specialization, so an
    // explicit cast avoids a spurious "not assignable to BodyInit" error.
    body: buffer as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409 || /duplicate/i.test(text)) {
      fail(
        `Upload failed: HTTP ${res.status}: ${text}\n\n` +
          `  An object already exists at "${BUCKET}/${storagePath}" — likely an orphan left behind by a\n` +
          `  previous publish attempt for this exact version_code+sha256 (e.g. a retry after a later\n` +
          `  step failed). To unblock, either:\n` +
          `    - delete the orphan object at ${BUCKET}/${storagePath} (Supabase Storage dashboard, or a\n` +
          `      service-role DELETE), then re-run this command; or\n` +
          `    - bump the APK's version_code and rebuild — a new version_code produces a new storage path.`,
      );
    }
    fail(`Upload failed: HTTP ${res.status}: ${text}`);
  }
}

async function insertRelease(
  supabaseUrl: string,
  serviceKey: string,
  row: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; status: number; text: string }> {
  const url = `${supabaseUrl}/rest/v1/pyra_app_releases`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...restHeaders(serviceKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) return { ok: false, status: res.status, text: await res.text() };
  return { ok: true };
}

// ── Modes ────────────────────────────────────────────────────────────────────

async function runActivate(args: ActivateArgs, supabaseUrl: string, serviceKey: string): Promise<void> {
  console.log(`Channel:            ${args.app}`);
  console.log(`Activating code:    ${args.versionCode}\n`);

  const target = await getReleaseByVersionCode(supabaseUrl, serviceKey, args.app, args.versionCode);
  if (!target) fail('لا يوجد إصدار بهذا الرقم');

  if (target.is_active) {
    console.log(`✅ version_code=${args.versionCode} (${target.version_name}) already active on ${args.app}. No change.`);
    return;
  }

  const current = await getActiveRelease(supabaseUrl, serviceKey, args.app);
  if (current) {
    console.log(`Deactivating current active release (version_code=${current.version_code}) ...`);
    await deactivateActive(supabaseUrl, serviceKey, args.app);
  }

  const activated = await activateReleaseById(supabaseUrl, serviceKey, target.id);
  if (!activated.ok) {
    console.error(
      `\n❌ Failed to activate version_code=${args.versionCode}: HTTP ${activated.status}: ${activated.text}`,
    );
    if (current) {
      console.error(
        `\n⚠️  "${args.app}" now has NO active release. Restore the previous version with:\n\n` +
          `   pnpm app:publish --activate ${current.version_code} --app ${args.app}\n`,
      );
    }
    process.exit(1);
  }

  console.log(`\n✅ Activated version_code=${args.versionCode} (${target.version_name}) on ${args.app}.`);
  if (current) console.log(`   Previously active: version_code=${current.version_code}`);
  console.log('\n📱 الأجهزة هتشوف التحديث خلال ٦ ساعات كحد أقصى.');
}

async function runPublish(args: PublishArgs, supabaseUrl: string, serviceKey: string): Promise<void> {
  if (!existsSync(args.apkPath)) fail(`APK not found: ${args.apkPath}`);

  let versionCode: number;
  let versionName: string;
  if (args.code !== null && args.name !== null) {
    versionCode = args.code;
    versionName = args.name;
    if (args.app === 'pyra-calls') {
      console.warn(
        '\n⚠️  WARNING: --code/--name bypasses aapt2 — the production-channel safety guards ' +
          '(application-debuggable check, package-name check) were SKIPPED for this publish.\n' +
          '   Verify manually that this APK is release-signed and is "cloud.pyramedia.calls" ' +
          'before trusting the fleet rollout.\n',
      );
    }
  } else {
    const aapt2 = findAapt2();
    if (!aapt2) {
      fail(
        'aapt2.exe not found (checked ANDROID_HOME, ANDROID_SDK_ROOT, %LOCALAPPDATA%\\Android\\Sdk\\build-tools\\*).\n' +
          '  Install via Android Studio → SDK Manager → SDK Tools → Android SDK Build-Tools,\n' +
          '  or pass --code N --name X explicitly to skip auto-detection.',
      );
    }
    console.log(`aapt2:        ${aapt2}`);
    const detected = detectVersionFromApk(args.apkPath, aapt2);
    versionCode = detected.versionCode;
    versionName = detected.versionName;
    enforceProductionSafetyGuards(args.app, detected.badgingOutput);
  }

  console.log(`App:          ${args.app}`);
  console.log(`Version code: ${versionCode}`);
  console.log(`Version name: ${versionName}`);

  const sizeBytes = statSync(args.apkPath).size;
  const sha256 = await sha256File(args.apkPath);
  console.log(`SHA-256:      ${sha256}`);
  console.log(`Size:         ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB\n`);

  const active = await getActiveRelease(supabaseUrl, serviceKey, args.app);
  if (active && versionCode <= active.version_code) {
    fail(
      `Refusing to publish: version_code ${versionCode} <= current active version_code ${active.version_code} ` +
        `(${active.version_name}) on ${args.app}.`,
    );
  }

  const storagePath = `app-releases/${args.app}/${versionCode}-${sha256.slice(0, 8)}.apk`;
  console.log(`Uploading to: ${BUCKET}/${storagePath} ...`);
  const apkBuffer = readFileSync(args.apkPath);
  await uploadApk(supabaseUrl, serviceKey, storagePath, apkBuffer);
  console.log('✅ Upload complete.\n');

  if (active) {
    console.log(`Deactivating current active release (version_code=${active.version_code}) ...`);
    await deactivateActive(supabaseUrl, serviceKey, args.app);
  }

  const row = {
    id: generateReleaseId(),
    app: args.app,
    version_code: versionCode,
    version_name: versionName,
    storage_path: storagePath,
    sha256,
    size_bytes: sizeBytes,
    release_notes: args.notes,
    is_active: true,
    created_by: args.by,
  };

  const inserted = await insertRelease(supabaseUrl, serviceKey, row);
  if (!inserted.ok) {
    console.error(`\n❌ Insert failed after deactivation: HTTP ${inserted.status}: ${inserted.text}`);
    if (active) {
      console.error(
        `\n⚠️  "${args.app}" now has NO active release. Restore the previous version with:\n\n` +
          `   pnpm app:publish --activate ${active.version_code} --app ${args.app}\n`,
      );
    }
    process.exit(1);
  }

  console.log('\n✅ Published successfully.');
  console.log(`  app:           ${args.app}`);
  console.log(`  version_code:  ${versionCode}`);
  console.log(`  version_name:  ${versionName}`);
  console.log(`  sha256:        ${sha256}`);
  console.log(`  size:          ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  storage_path:  ${storagePath}`);
  if (args.notes) console.log(`  notes:         ${args.notes}`);
  console.log('\n📱 الأجهزة هتشوف التحديث خلال ٦ ساعات كحد أقصى.');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);
  const serviceKey = readServiceRoleKey();
  const supabaseUrl = readSupabaseUrl();

  if (parsed.mode === 'activate') {
    await runActivate(parsed, supabaseUrl, serviceKey);
    return;
  }
  await runPublish(parsed, supabaseUrl, serviceKey);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

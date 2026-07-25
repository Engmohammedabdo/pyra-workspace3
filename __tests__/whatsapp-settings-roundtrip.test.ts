import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSettingObject, parseSettingBool } from '@/lib/settings/parse';

/**
 * The WhatsApp settings page persisted nothing at all. Three independent faults,
 * verified 2026-07-25:
 *   1. all six saves called PUT /api/settings — the route only exports GET and
 *      PATCH, so every one returned 405 while the toast still said "saved";
 *   2. the reads asked for `/api/settings?key=…` and ran Array.isArray() on the
 *      result, but GET ignores the query and always returns a { key: value } map,
 *      so every read fell through to its default;
 *   3. `pyra_settings.value` is TEXT, yet consumers did `setting.value.mode` and
 *      `setting.value.enabled === true` — properties of a string, always
 *      undefined, silently disabling auto-assignment, CSAT and away messages.
 * pyra_settings held ZERO whatsapp% rows, confirming nothing ever saved.
 *
 * These are source-level assertions because the faults were contract mismatches
 * between files — exactly what a mocked unit test would paper over.
 */
const COMPONENT = path.join(
  process.cwd(),
  'components/dashboard/sales-settings/SalesSettingsContent.tsx',
);
const SETTINGS_ROUTE = path.join(process.cwd(), 'app/api/settings/route.ts');
const WA_WEBHOOK = path.join(
  process.cwd(),
  'app/api/dashboard/sales/whatsapp/webhook/route.ts',
);

describe('sales-settings save path', () => {
  const src = readFileSync(COMPONENT, 'utf8');

  it('no longer calls the non-existent PUT handler', () => {
    expect(src).not.toContain("'/api/settings', 'PUT'");
  });

  it('uses PATCH with the map body shape the route expects', () => {
    expect(src).toContain("mutateAPI('/api/settings', 'PATCH'");
    // The old { key, value } envelope must be gone.
    expect(src).not.toMatch(/'\/api\/settings',\s*'PATCH',\s*\{\s*\n\s*key:/);
  });

  it('serialises object-valued settings, since the column is TEXT', () => {
    expect(src).toContain('JSON.stringify({ mode })');
    expect(src).toContain('JSON.stringify({ enabled })');
    expect(src).toContain('JSON.stringify(config)');
  });

  it('never writes a masked secret back over the real one', () => {
    expect(src).toContain('MASK_PREFIX');
  });

  it('stopped asking for a ?key= filter the GET handler ignores', () => {
    expect(src).not.toContain('/api/settings?key=');
  });
});

describe('settings route allowlist', () => {
  const src = readFileSync(SETTINGS_ROUTE, 'utf8');

  it('accepts every key the sales-settings page writes', () => {
    for (const key of [
      'whatsapp_auto_assignment',
      'whatsapp_csat_enabled',
      'whatsapp_business_hours',
      'whatsapp_ai_provider',
      'whatsapp_ai_api_key',
      'whatsapp_ai_suggestions_enabled',
    ]) {
      expect(src, `${key} missing from ALLOWED_KEYS`).toContain(`'${key}'`);
    }
  });
});

describe('server consumers parse the TEXT column', () => {
  const src = readFileSync(WA_WEBHOOK, 'utf8');

  it('no longer reads object properties off a string', () => {
    expect(src).not.toContain('setting?.value?.mode');
    expect(src).not.toContain('setting?.value?.enabled');
  });

  it('goes through the shared parser', () => {
    expect(src).toContain('parseSettingObject');
    expect(src).toContain('parseSettingBool');
  });
});

/**
 * End-to-end shape check: what the component writes must be exactly what the
 * consumers can read back. This is the contract that was broken.
 */
describe('write shape round-trips to the read shape', () => {
  it('auto-assignment mode survives the trip', () => {
    const written = JSON.stringify({ mode: 'round_robin' });
    expect(parseSettingObject<{ mode?: string }>(written)?.mode).toBe('round_robin');
  });

  it('CSAT toggle survives the trip', () => {
    expect(parseSettingBool(JSON.stringify({ enabled: true }), false)).toBe(true);
    expect(parseSettingBool(JSON.stringify({ enabled: false }), true)).toBe(false);
  });

  it('AI suggestions toggle survives the trip', () => {
    expect(parseSettingBool(String(false), true)).toBe(false);
    expect(parseSettingBool(String(true), false)).toBe(true);
  });

  it('business hours config survives the trip', () => {
    const config = {
      enabled: true,
      timezone: 'Asia/Dubai',
      away_message: 'خارج ساعات العمل',
      schedule: { monday: { start: '09:00', end: '18:00' } },
    };
    expect(parseSettingObject(JSON.stringify(config))).toEqual(config);
  });
});

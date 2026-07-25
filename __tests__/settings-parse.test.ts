import { describe, it, expect } from 'vitest';
import { parseSettingObject, parseSettingBool } from '@/lib/settings/parse';

/**
 * pyra_settings.value is a TEXT column. Call sites that did
 * `setting?.value?.mode` were reading a property off a string and always got
 * undefined, which silently disabled WhatsApp auto-assignment, CSAT and the
 * out-of-hours away message.
 */
describe('parseSettingObject', () => {
  it('parses a JSON object written as text', () => {
    expect(parseSettingObject('{"mode":"round_robin"}')).toEqual({ mode: 'round_robin' });
  });

  it('parses a nested config', () => {
    const cfg = { enabled: true, timezone: 'Asia/Dubai', schedule: { mon: { open: '09:00' } } };
    expect(parseSettingObject(JSON.stringify(cfg))).toEqual(cfg);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseSettingObject('  {"enabled":true}  ')).toEqual({ enabled: true });
  });

  it('returns null for the "[object Object]" corruption String(obj) produces', () => {
    expect(parseSettingObject('[object Object]')).toBeNull();
  });

  it('returns null for absent or blank values', () => {
    expect(parseSettingObject(null)).toBeNull();
    expect(parseSettingObject(undefined)).toBeNull();
    expect(parseSettingObject('')).toBeNull();
    expect(parseSettingObject('   ')).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    expect(parseSettingObject('"just a string"')).toBeNull();
    expect(parseSettingObject('42')).toBeNull();
    expect(parseSettingObject('true')).toBeNull();
    expect(parseSettingObject('[1,2,3]')).toBeNull();
  });

  it('passes through an already-parsed object', () => {
    expect(parseSettingObject({ mode: 'manual' })).toEqual({ mode: 'manual' });
  });

  it('never throws on malformed JSON', () => {
    expect(() => parseSettingObject('{not json')).not.toThrow();
    expect(parseSettingObject('{not json')).toBeNull();
  });
});

describe('parseSettingBool', () => {
  it('reads the string form the settings API stores', () => {
    expect(parseSettingBool('true')).toBe(true);
    expect(parseSettingBool('false')).toBe(false);
  });

  it('reads the { enabled } object shape the toggles write', () => {
    expect(parseSettingBool('{"enabled":true}')).toBe(true);
    expect(parseSettingBool('{"enabled":false}')).toBe(false);
  });

  it('accepts a real boolean', () => {
    expect(parseSettingBool(true)).toBe(true);
    expect(parseSettingBool(false)).toBe(false);
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(parseSettingBool(' TRUE ')).toBe(true);
    expect(parseSettingBool('False')).toBe(false);
  });

  it('honours the fallback when unset or unintelligible', () => {
    expect(parseSettingBool(null, true)).toBe(true);
    expect(parseSettingBool(undefined, false)).toBe(false);
    expect(parseSettingBool('', true)).toBe(true);
    expect(parseSettingBool('[object Object]', true)).toBe(true);
    expect(parseSettingBool('{"other":1}', true)).toBe(true);
  });

  it('defaults to false when no fallback is given', () => {
    expect(parseSettingBool(null)).toBe(false);
  });
});

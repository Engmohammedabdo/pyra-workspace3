import { describe, it, expect } from 'vitest';
import { buildColleagueCallNotice } from '@/lib/calls/colleague-call-notice';

const base = {
  leadId: 'sl_abc123',
  leadName: 'Milestones Coffee Abu Dhabi Mall',
  callerDisplayName: 'كوزيت',
  callerUsername: 'cosette',
  direction: 'outgoing',
  durationSeconds: 185,
  // 2026-08-10 14:30 UTC = 18:30 Dubai (UTC+4, no DST)
  calledAtIso: '2026-08-10T14:30:00.000Z',
};

describe('buildColleagueCallNotice', () => {
  it('names the colleague, the customer, the duration and the Dubai time', () => {
    const n = buildColleagueCallNotice(base);
    expect(n.title).toBe('زميلك كلّم عميلك');
    expect(n.message).toContain('كوزيت');
    expect(n.message).toContain('Milestones Coffee Abu Dhabi Mall');
    expect(n.message).toContain('3 دقيقة');
    expect(n.message).toContain('18:30');
  });

  it('links to the canonical CRM lead page', () => {
    // Must start with /dashboard or the bell drops it on
    // /dashboard/notifications instead of the lead.
    expect(buildColleagueCallNotice(base).link).toBe('/dashboard/crm/leads/sl_abc123');
    expect(buildColleagueCallNotice(base).link.startsWith('/dashboard')).toBe(true);
  });

  it('says where the call actually lives, because the lead timeline has nothing', () => {
    // The ownership boundary writes no activity on an unowned match, so an
    // owner who goes looking would find an empty timeline. This sentence is
    // what stops that hunt.
    expect(buildColleagueCallNotice(base).message).toContain('تقرير المكالمات');
  });

  it('flips the wording for an inbound call — the customer rang the colleague', () => {
    const n = buildColleagueCallNotice({ ...base, direction: 'incoming' });
    expect(n.title).toBe('عميلك اتصل بزميلك');
    // The customer is the subject now, not the object.
    expect(n.message.indexOf('Milestones')).toBeLessThan(n.message.indexOf('كوزيت'));
  });

  it('reports sub-minute calls in seconds, not "0 minutes"', () => {
    expect(buildColleagueCallNotice({ ...base, durationSeconds: 42 }).message).toContain('42 ثانية');
    expect(buildColleagueCallNotice({ ...base, durationSeconds: 59 }).message).toContain('59 ثانية');
    expect(buildColleagueCallNotice({ ...base, durationSeconds: 60 }).message).toContain('1 دقيقة');
  });

  it('falls back to the username when the display name is missing or blank', () => {
    expect(buildColleagueCallNotice({ ...base, callerDisplayName: null }).message).toContain('cosette');
    expect(buildColleagueCallNotice({ ...base, callerDisplayName: '   ' }).message).toContain('cosette');
  });

  it('never renders a nameless lead as an empty quote', () => {
    // Real prod rows: 1,254 leads, and `name` is not enforced non-blank.
    const n = buildColleagueCallNotice({ ...base, leadName: null });
    expect(n.message).toContain('عميل من غير اسم');
    expect(n.message).not.toContain('«»');
  });

  it('omits the time rather than inventing one when the timestamp is unparseable', () => {
    const n = buildColleagueCallNotice({ ...base, calledAtIso: 'not-a-date' });
    expect(n.message).toContain('كوزيت');
    expect(n.message).not.toContain('undefined');
    expect(n.message).not.toContain('NaN');
    expect(n.message).not.toContain('Invalid');
  });

  it('contains no ASCII question mark — that is the Arabic-corruption signature', () => {
    // The Arabic question mark is U+061F; a literal '?' in Arabic text means a
    // code page mangled it somewhere upstream.
    expect(buildColleagueCallNotice(base).message).not.toContain('?');
    expect(buildColleagueCallNotice(base).title).not.toContain('?');
  });
});

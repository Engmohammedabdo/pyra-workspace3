import { describe, it, expect } from 'vitest';
import { computeCelebrations, deriveAlerts, type AlertTranslator } from '@/lib/hr/overview-helpers';

// Stub translator standing in for `getTranslations('hr.overview.alerts')` —
// mirrors the AR catalog verbatim (messages/ar/hr.json → hr.overview.alerts.*)
// so these tests keep proving AR string fidelity (i18n Phase 5.6, Approach A).
const AR_ALERT_MESSAGES: Record<string, string> = {
  leaveBacklog: '{count} طلبات إجازة تنتظر الموافقة',
  leavePending: '{count} طلب إجازة بانتظار الموافقة',
  payrollNotCalculated: 'رواتب الشهر الحالي لم تُحتسب بعد',
  absentNoLeave: '{count} موظفين غائبون بلا إجازة اليوم',
  docsExpired: '{count} وثيقة منتهية الصلاحية',
  docsExpiringSoon: '{count} وثيقة تنتهي خلال 30 يوماً',
};

const tStub: AlertTranslator = (key, values) => {
  const template = AR_ALERT_MESSAGES[key];
  if (!template) return key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    template,
  );
};

describe('computeCelebrations', () => {
  it('flags a birthday in the current month and computes anniversary years', () => {
    const users = [
      { username: 'a', display_name: 'A', date_of_birth: '1990-06-15', hire_date: '2020-06-02' },
      { username: 'b', display_name: 'B', date_of_birth: null, hire_date: '2019-01-10' },
    ];
    const res = computeCelebrations(users, '2026-06-27');
    const a = res.filter((c) => c.username === 'a');
    expect(a.some((c) => c.kind === 'birthday')).toBe(true);
    expect(a.some((c) => c.kind === 'anniversary' && c.years === 6)).toBe(true);
    expect(res.some((c) => c.username === 'b')).toBe(false); // Jan, not June
  });

  it('excludes users whose birthday/hire month does not match', () => {
    const users = [
      { username: 'c', display_name: 'C', date_of_birth: '1985-03-10', hire_date: '2021-03-01' },
    ];
    const res = computeCelebrations(users, '2026-06-27');
    expect(res).toHaveLength(0);
  });

  it('handles users with no date_of_birth but matching hire_date month', () => {
    const users = [
      { username: 'd', display_name: 'D', date_of_birth: null, hire_date: '2022-06-15' },
    ];
    const res = computeCelebrations(users, '2026-06-01');
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('anniversary');
    expect(res[0].years).toBe(4);
  });

  it('does not emit anniversary for year 0 (hired this year)', () => {
    const users = [
      { username: 'e', display_name: 'E', date_of_birth: null, hire_date: '2026-06-01' },
    ];
    const res = computeCelebrations(users, '2026-06-27');
    // years = 2026 - 2026 = 0, should NOT push anniversary
    expect(res.filter((c) => c.kind === 'anniversary')).toHaveLength(0);
  });
});

describe('deriveAlerts', () => {
  it('emits a critical alert when pending approvals exceed 5', () => {
    const alerts = deriveAlerts({ leavePending: 6, payrollCalculated: true, absentNoLeave: 0, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
  });

  it('emits high when payroll not calculated mid-month', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: false, absentNoLeave: 0, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    expect(alerts.some((a) => a.severity === 'high')).toBe(true);
  });

  it('emits medium alert when 1-5 pending leaves (not critical)', () => {
    const alerts = deriveAlerts({ leavePending: 3, payrollCalculated: true, absentNoLeave: 0, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    expect(alerts.some((a) => a.severity === 'medium')).toBe(true);
    expect(alerts.every((a) => a.severity !== 'critical')).toBe(true);
  });

  it('emits high alert for absent employees with no leave', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: true, absentNoLeave: 2, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    expect(alerts.some((a) => a.severity === 'high' && a.id === 'absent-no-leave')).toBe(true);
  });

  it('returns empty array when everything is fine', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: true, absentNoLeave: 0, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    expect(alerts).toHaveLength(0);
  });

  it('sorts alerts by severity (critical first)', () => {
    const alerts = deriveAlerts({ leavePending: 6, payrollCalculated: false, absentNoLeave: 2, docsExpiringSoon: 0, docsExpired: 0 }, tStub);
    const severities = alerts.map((a) => a.severity);
    expect(severities[0]).toBe('critical');
    // high items follow
    expect(severities.every((s, i) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      return i === 0 || rank[s as keyof typeof rank] >= rank[severities[i - 1] as keyof typeof rank];
    })).toBe(true);
  });

  it('emits a critical docs-expired alert when docsExpired > 0', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: true, absentNoLeave: 0, docsExpiringSoon: 0, docsExpired: 3 }, tStub);
    const expired = alerts.find((a) => a.id === 'docs-expired');
    expect(expired).toBeDefined();
    expect(expired?.severity).toBe('critical');
    expect(expired?.href).toBe('/dashboard/hr/documents');
    expect(expired?.message).toContain('3');
  });

  it('emits a high docs-expiring-soon alert when docsExpiringSoon > 0', () => {
    const alerts = deriveAlerts({ leavePending: 0, payrollCalculated: true, absentNoLeave: 0, docsExpiringSoon: 2, docsExpired: 0 }, tStub);
    const expiringSoon = alerts.find((a) => a.id === 'docs-expiring-soon');
    expect(expiringSoon).toBeDefined();
    expect(expiringSoon?.severity).toBe('high');
    expect(expiringSoon?.href).toBe('/dashboard/hr/documents');
    expect(expiringSoon?.message).toContain('2');
  });
});

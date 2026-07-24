import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('admin deductions review surface', () => {
  it('is hr.manage-only and uses the React Query deductions layer', () => {
    const page = source('app/dashboard/hr/deductions/page.tsx');
    const client = source('app/dashboard/hr/deductions/deductions-client.tsx');

    expect(page).toContain("requirePermission('hr.manage')");
    expect(client).toContain('useAdminDeductions');
    expect(client).toContain('ManualDeductionDialog');
    expect(client).not.toMatch(/\bfetch\s*\(/);
  });

  it('wires admin navigation, guide discovery, and the HR roster review link', () => {
    const nav = source('components/layout/nav-config.ts');
    const guideMap = source('lib/config/module-guide.ts');
    const guidePage = source('app/dashboard/guide/page.tsx');
    const roster = source('components/hr/overview/DailyAttendanceRoster.tsx');

    expect(nav).toContain("key: 'deductions'");
    expect(nav).toContain("href: '/dashboard/hr/deductions'");
    expect(nav).toContain("permission: 'hr.manage'");
    expect(guideMap).toContain("'/dashboard/hr/deductions'");
    expect(guidePage).toContain("'/dashboard/hr/deductions'");
    expect(guidePage).toContain("usePermission('hr.manage')");
    expect(guidePage).toContain("guide.href !== '/dashboard/hr/deductions'");
    expect(roster).toContain("usePermission('hr.manage')");
    expect(roster).toContain('href="/dashboard/hr/deductions"');
  });

  it('keeps manual approval explicit, documented, capped, and idempotent', () => {
    const dialog = source('components/hr/deductions/ManualDeductionDialog.tsx');

    expect(dialog).toContain('useApproveManualDeduction');
    expect(dialog).toContain("generateId('md')");
    expect(dialog).toContain('MANUAL_DEDUCTION_BASIS');
    expect(dialog).toContain('evidence_task_ids');
    expect(dialog).toContain('owner_attestation');
    expect(dialog).not.toContain("source: 'admin_manual_deduction_form'");
    expect(dialog).not.toMatch(/\bevidence:\s*\{/);
    expect(dialog).toContain('employee?.cap_ledger?.remaining_amount');
    expect(dialog).not.toContain('employee?.candidate?.cap.remaining_cap_amount');
    expect(dialog).toContain('reason.trim()');
    expect(dialog).not.toMatch(/\bfetch\s*\(/);
  });

  it('shows a separate unowned-evidence section without assigning it to an employee', () => {
    const client = source('app/dashboard/hr/deductions/deductions-client.tsx');

    expect(client).toContain('report.unattributed_tasks');
    expect(client).toContain('admin.unattributed');
  });
});

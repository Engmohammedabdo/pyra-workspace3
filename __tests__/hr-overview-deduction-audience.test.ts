import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import hrMessages from '@/messages/en/hr.json';
import { DailyAttendanceRoster } from '@/components/hr/overview/DailyAttendanceRoster';
import { isEmployeeDeductionAudience } from '@/lib/hr/deductions';

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => false,
}));

afterEach(() => cleanup());

describe('HR overview deduction audience', () => {
  it('limits deduction money to employee roles while sales remains attendance-only', () => {
    expect(isEmployeeDeductionAudience('employee')).toBe(true);
    expect(isEmployeeDeductionAudience('sales_agent')).toBe(false);
    expect(isEmployeeDeductionAudience('admin')).toBe(false);

    const route = readFileSync(
      resolve(process.cwd(), 'app/api/hr/overview/route.ts'),
      'utf8',
    );
    expect(route).toContain('isEmployeeDeductionAudience(u.role)');
    expect(route).toMatch(/const candidateDates = deductionEligible && trackingStart/);
    expect(route).toContain("u.attendance_tracking_start_source !== 'observed'");
    expect(route).toContain("u.attendance_tracking_start_source !== 'admin'");
    expect(route).toMatch(/const rosterStatusOrder:[\s\S]*late: 1/);
  });

  it('shows attendance units but never invents AED money when salary evidence is missing', () => {
    render(createElement(
      NextIntlClientProvider,
      {
        locale: 'en',
        messages: hrMessages,
        children: createElement(DailyAttendanceRoster, { roster: [{
          username: 'missing.salary',
          display_name: 'Missing Salary',
          status: 'late',
          clock_in_time: '10:00',
          clock_out_time: null,
          total_hours: 0,
          expected_start: '09:00',
          late_minutes: 60,
          deductible_absences: 1,
          deduction_units: 0.25,
          deduction_incidents: [{
            date: '2026-07-22',
            late_minutes: 60,
            kind: 'late',
            excused: false,
            units: 0.25,
          }],
          estimated_deduction: null,
          currency: null,
        }] }),
      },
    ));

    expect(screen.getByText('Amount unavailable until salary and currency are documented.'))
      .toBeInTheDocument();
    expect(screen.queryByText(/AED/)).toBeNull();
  });
});

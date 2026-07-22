import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import hrMessages from '@/messages/en/hr.json';

const mocks = vi.hoisted(() => ({
  useMyPayslips: vi.fn(),
}));

vi.mock('@/hooks/usePayroll', () => ({ useMyPayslips: mocks.useMyPayslips }));
vi.mock('@/components/hr/deductions/MyDeductionRiskPanel', () => ({
  MyDeductionRiskPanel: () => null,
}));
vi.mock('@/lib/i18n/status-labels', () => ({
  useStatusLabels: () => (status: string) => status,
}));
vi.mock('@/lib/pdf/payslip-pdf', () => ({ generatePayslipPDF: vi.fn() }));

import MyPayslipsClient from '@/app/dashboard/my-payslips/my-payslips-client';

describe('employee cancelled deduction history', () => {
  beforeEach(() => {
    mocks.useMyPayslips.mockReturnValue({
      isLoading: false,
      data: {
        payslips: [],
        payments: [{
          id: 'pay-cancelled',
          source_type: 'deduction',
          description: 'Delivery deduction',
          amount: 100,
          currency: 'AED',
          status: 'rejected',
          created_at: '2026-07-20T08:00:00.000Z',
          cancelled_at: '2026-07-22T12:00:00.000Z',
          cancelled_by: 'admin',
          cancellation_reason: 'Excuse accepted',
        }],
      },
    });
  });

  afterEach(() => cleanup());

  it('labels a rejected deduction as cancelled history without a negative amount', () => {
    render(
      <NextIntlClientProvider locale="en" messages={hrMessages}>
        <MyPayslipsClient />
      </NextIntlClientProvider>,
    );

    const cancelled = screen.getByTestId('cancelled-payment-pay-cancelled');
    expect(cancelled).toHaveTextContent('Deduction cancelled');
    expect(cancelled).toHaveTextContent('Excuse accepted');
    expect(cancelled).toHaveTextContent('100.00 AED');
    expect(cancelled.textContent).not.toContain('-‎100.00 AED');
  });
});

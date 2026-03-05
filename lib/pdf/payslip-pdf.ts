'use client';

import jsPDF from 'jspdf';
import { registerArabicFont } from './pdf-fonts';

// ============================================================
// Payslip PDF Generator
// Uses jsPDF to generate professional payslip PDFs
// Follows the same design language as invoice-pdf.ts
// ============================================================

interface DeductionDetail {
  type: string;
  amount: number;
}

interface PayslipData {
  company_name: string;
  employee_name: string;
  department: string | null;
  month: number;
  year: number;
  currency: string;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  deductions: number;
  deduction_details: DeductionDetail[];
  net_pay: number;
}

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Generate and download a PDF payslip.
 */
export async function generatePayslipPDF(data: PayslipData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await registerArabicFont(doc);
  const arText = (t: string) => doc.processArabic(t);

  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ── Header bar ──
  doc.setFillColor(249, 115, 22); // Orange
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('Amiri', 'bold');
  doc.text(arText(data.company_name || 'Pyra Workspace'), pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('PAYSLIP', pageWidth / 2, 28, { align: 'center' });

  y = 45;

  // ── Employee Info ──
  doc.setTextColor(24, 24, 27);
  doc.setFontSize(10);

  // Left: Employee name
  doc.setFont('helvetica', 'bold');
  doc.text('Employee:', margin, y);
  doc.setFont('Amiri', 'normal');
  doc.text(arText(data.employee_name), margin + 28, y);

  // Right: Period
  const rightCol = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.text('Period:', rightCol - 50, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${MONTH_NAMES_AR[data.month - 1]} ${data.year}`, rightCol, y, { align: 'right' });

  y += 7;

  // Department
  if (data.department) {
    doc.setFont('helvetica', 'bold');
    doc.text('Department:', margin, y);
    doc.setFont('Amiri', 'normal');
    doc.text(arText(data.department), margin + 28, y);
  }

  y += 12;

  // ── Divider ──
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ── Earnings Table ──
  // Table header
  doc.setFillColor(244, 244, 245);
  doc.rect(margin, y, contentWidth, 9, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(24, 24, 27);

  const descCol = margin + 4;
  const amountCol = margin + contentWidth - 4;

  doc.text('Description', descCol, y + 6.5);
  doc.text('Amount', amountCol, y + 6.5, { align: 'right' });

  y += 9;

  // Table rows
  const rows: Array<{ label: string; labelAr: string; amount: number; isNegative?: boolean }> = [
    { label: 'Base Salary', labelAr: 'الراتب الأساسي', amount: data.base_salary },
    { label: 'Task Payments', labelAr: 'مدفوعات المهام', amount: data.task_payments },
    { label: 'Overtime', labelAr: 'العمل الإضافي', amount: data.overtime_amount },
    { label: 'Bonus', labelAr: 'المكافآت', amount: data.bonus },
  ];

  // Add deduction details
  if (data.deduction_details && data.deduction_details.length > 0) {
    data.deduction_details.forEach((d, idx) => {
      rows.push({
        label: `Deduction ${idx + 1}`,
        labelAr: `خصم ${idx + 1}`,
        amount: d.amount,
        isNegative: true,
      });
    });
  } else if (data.deductions > 0) {
    rows.push({
      label: 'Deductions',
      labelAr: 'الخصومات',
      amount: data.deductions,
      isNegative: true,
    });
  }

  doc.setFontSize(10);

  rows.forEach((row, index) => {
    // Skip zero-amount rows (except base salary)
    if (row.amount === 0 && row.label !== 'Base Salary') return;

    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 9, 'F');
    }

    const rowY = y + 6.5;

    // Arabic label on the right side, English on left
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(113, 113, 122);
    doc.text(row.label, descCol, rowY);

    doc.setFont('Amiri', 'normal');
    doc.setTextColor(113, 113, 122);
    doc.text(arText(row.labelAr), descCol + 40, rowY);

    // Amount
    doc.setFont('helvetica', 'normal');
    if (row.isNegative) {
      doc.setTextColor(220, 38, 38); // Red for deductions
      doc.text(`- ${formatAmount(row.amount, data.currency)}`, amountCol, rowY, { align: 'right' });
    } else {
      doc.setTextColor(24, 24, 27);
      doc.text(formatAmount(row.amount, data.currency), amountCol, rowY, { align: 'right' });
    }

    y += 9;
  });

  y += 4;

  // ── Total Net Pay ──
  doc.setFillColor(249, 115, 22);
  doc.rect(margin, y, contentWidth, 12, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('NET PAY', descCol, y + 8);

  doc.setFont('Amiri', 'bold');
  doc.text(arText('صافي الراتب'), descCol + 30, y + 8);

  doc.setFont('helvetica', 'bold');
  doc.text(formatAmount(data.net_pay, data.currency), amountCol, y + 8, { align: 'right' });

  y += 20;

  // ── Summary Box ──
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(113, 113, 122);

  const totalEarnings = data.base_salary + data.task_payments + data.overtime_amount + data.bonus;

  doc.text('Total Earnings:', margin + 5, y + 9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(formatAmount(totalEarnings, data.currency), margin + 45, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(113, 113, 122);
  doc.text('Total Deductions:', margin + contentWidth / 2 + 5, y + 9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(formatAmount(data.deductions, data.currency), margin + contentWidth / 2 + 50, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(113, 113, 122);
  doc.text('Net Pay:', margin + 5, y + 18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(24, 24, 27);
  doc.text(formatAmount(data.net_pay, data.currency), margin + 45, y + 18);

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      'Generated by Pyra Workspace',
      pageWidth / 2,
      292,
      { align: 'center' }
    );
  }

  // Save
  const monthName = MONTH_NAMES_AR[data.month - 1];
  doc.save(`payslip-${data.employee_name}-${monthName}-${data.year}.pdf`);
}

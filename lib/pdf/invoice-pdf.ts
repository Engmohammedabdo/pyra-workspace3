'use client';

import jsPDF from 'jspdf';

// ============================================================
// Invoice PDF Generator — Matches quote-pdf.ts style
// Uses jsPDF to generate professional invoice PDFs
// ============================================================

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface PaymentRecord {
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
}

interface InvoiceData {
  invoice_number: string;
  quote_id: string | null;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  notes: string | null;
  terms_conditions: Array<{ text: string }> | null;
  bank_details: {
    bank: string;
    account_name: string;
    account_no: string;
    iban: string;
  } | null;
  company_name: string | null;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  project_name: string | null;
  milestone_type: string | null;
  items: InvoiceItem[];
  payments?: PaymentRecord[];
}

const ORANGE = '#f97316';
const DARK = '#18181b';
const GRAY = '#71717a';
const LIGHT_GRAY = '#f4f4f5';
const GREEN = '#16a34a';

function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

const MILESTONE_LABELS: Record<string, string> = {
  booking_deposit: 'Booking Deposit',
  initial_delivery: 'Initial Delivery',
  final_delivery: 'Final Delivery',
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  credit_card: 'Credit Card',
  online: 'Online',
  other: 'Other',
};

/**
 * Generate and download a PDF for an invoice.
 * Follows the same design language as generateQuotePDF.
 */
export function generateInvoicePDF(invoice: InvoiceData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header bar ──
  doc.setFillColor(249, 115, 22); // Orange
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.company_name || 'Pyra Workspace', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('INVOICE', pageWidth / 2, 28, { align: 'center' });

  y = 45;

  // ── Invoice Info ──
  doc.setTextColor(24, 24, 27);
  doc.setFontSize(10);

  // Left side: Invoice details
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice No:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoice_number, margin + 30, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Issue Date:', margin, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(invoice.issue_date), margin + 30, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Due Date:', margin, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(invoice.due_date), margin + 30, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Status:', margin, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(STATUS_LABELS[invoice.status] || invoice.status, margin + 30, y + 18);

  if (invoice.milestone_type) {
    doc.setFont('helvetica', 'bold');
    doc.text('Milestone:', margin, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.text(MILESTONE_LABELS[invoice.milestone_type] || invoice.milestone_type, margin + 30, y + 24);
  }

  if (invoice.quote_id) {
    const extraY = invoice.milestone_type ? 30 : 24;
    doc.setFont('helvetica', 'bold');
    doc.text('Ref Quote:', margin, y + extraY);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.quote_id, margin + 30, y + extraY);
  }

  // Right side: Client details
  const rightCol = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', rightCol, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  let clientY = y + 6;
  if (invoice.client_name) {
    doc.setTextColor(24, 24, 27);
    doc.text(invoice.client_name, rightCol, clientY, { align: 'right' });
    clientY += 6;
  }
  if (invoice.client_company) {
    doc.text(invoice.client_company, rightCol, clientY, { align: 'right' });
    clientY += 6;
  }
  if (invoice.client_email) {
    doc.setTextColor(113, 113, 122);
    doc.text(invoice.client_email, rightCol, clientY, { align: 'right' });
    clientY += 5;
  }
  if (invoice.client_phone) {
    doc.text(invoice.client_phone, rightCol, clientY, { align: 'right' });
    clientY += 5;
  }
  if (invoice.client_address) {
    doc.text(invoice.client_address, rightCol, clientY, { align: 'right' });
  }

  y += 38;

  // ── Project name ──
  if (invoice.project_name) {
    doc.setTextColor(24, 24, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Project: ${invoice.project_name}`, margin, y);
    y += 10;
  }

  // ── Items Table ──
  // Table header
  doc.setFillColor(244, 244, 245);
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(24, 24, 27);

  const col1 = margin + 2;         // #
  const col2 = margin + 12;        // Description
  const col3 = margin + contentWidth - 60; // Qty
  const col4 = margin + contentWidth - 40; // Rate
  const col5 = margin + contentWidth - 2;  // Amount

  doc.text('#', col1, y + 5.5);
  doc.text('Description', col2, y + 5.5);
  doc.text('Qty', col3, y + 5.5);
  doc.text('Rate', col4, y + 5.5);
  doc.text('Amount', col5, y + 5.5, { align: 'right' });

  y += 8;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  invoice.items.forEach((item, index) => {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    const rowY = y + 5;

    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 8, 'F');
    }

    doc.setTextColor(24, 24, 27);
    doc.text(String(index + 1), col1, rowY);
    const desc = item.description.length > 50 ? item.description.slice(0, 50) + '...' : item.description;
    doc.text(desc, col2, rowY);
    doc.text(String(item.quantity), col3, rowY);
    doc.text(item.rate.toFixed(2), col4, rowY);
    doc.text(item.amount.toFixed(2), col5, rowY, { align: 'right' });

    y += 8;
  });

  y += 4;

  // ── Totals ──
  const totalsX = margin + contentWidth - 70;
  const totalsValueX = margin + contentWidth - 2;

  // Subtotal
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(113, 113, 122);
  doc.text('Subtotal:', totalsX, y);
  doc.setTextColor(24, 24, 27);
  doc.text(formatCurrency(invoice.subtotal, invoice.currency), totalsValueX, y, { align: 'right' });
  y += 6;

  // Tax
  doc.setTextColor(113, 113, 122);
  doc.text(`Tax (${invoice.tax_rate}%):`, totalsX, y);
  doc.setTextColor(24, 24, 27);
  doc.text(formatCurrency(invoice.tax_amount, invoice.currency), totalsValueX, y, { align: 'right' });
  y += 8;

  // Total
  doc.setFillColor(249, 115, 22);
  doc.rect(totalsX - 5, y - 4.5, contentWidth - (totalsX - margin) + 7, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL:', totalsX, y + 2);
  doc.text(formatCurrency(invoice.total, invoice.currency), totalsValueX, y + 2, { align: 'right' });

  y += 14;

  // ── Payment Summary (if partially/fully paid) ──
  if (invoice.amount_paid > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // Amount Paid
    doc.setTextColor(22, 163, 74); // GREEN
    doc.text('Amount Paid:', totalsX, y);
    doc.text(`- ${formatCurrency(invoice.amount_paid, invoice.currency)}`, totalsValueX, y, { align: 'right' });
    y += 6;

    // Amount Due
    if (invoice.amount_due > 0) {
      doc.setFillColor(254, 242, 242);
      doc.rect(totalsX - 5, y - 4, contentWidth - (totalsX - margin) + 7, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(220, 38, 38);
      doc.text('BALANCE DUE:', totalsX, y + 2);
      doc.text(formatCurrency(invoice.amount_due, invoice.currency), totalsValueX, y + 2, { align: 'right' });
    } else {
      doc.setFillColor(220, 252, 231);
      doc.rect(totalsX - 5, y - 4, contentWidth - (totalsX - margin) + 7, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(22, 163, 74);
      doc.text('PAID IN FULL', totalsX, y + 2);
    }
    y += 14;
  } else {
    y += 4;
  }

  // ── Payment History ──
  if (invoice.payments && invoice.payments.length > 0) {
    if (y > 230) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Payment History', margin, y);
    y += 7;

    // Payment table header
    doc.setFillColor(244, 244, 245);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', margin + 2, y + 5);
    doc.text('Method', margin + 40, y + 5);
    doc.text('Reference', margin + 80, y + 5);
    doc.text('Amount', margin + contentWidth - 2, y + 5, { align: 'right' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    invoice.payments.forEach((pay) => {
      if (y > 270) { doc.addPage(); y = margin; }

      doc.setTextColor(24, 24, 27);
      doc.text(formatDate(pay.payment_date), margin + 2, y + 4);
      doc.text(METHOD_LABELS[pay.method] || pay.method, margin + 40, y + 4);
      doc.text(pay.reference || '—', margin + 80, y + 4);
      doc.setTextColor(22, 163, 74);
      doc.text(formatCurrency(pay.amount, invoice.currency), margin + contentWidth - 2, y + 4, { align: 'right' });
      y += 6;
    });

    y += 6;
  }

  // ── Bank Details ──
  if (invoice.bank_details && invoice.bank_details.bank) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Bank Details', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);

    const bankInfo: [string, string][] = [
      ['Bank:', invoice.bank_details.bank],
      ['Account:', invoice.bank_details.account_name],
      ['Account No:', invoice.bank_details.account_no],
      ['IBAN:', invoice.bank_details.iban],
    ];

    bankInfo.forEach(([label, value]) => {
      if (value) {
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.text(value, margin + 30, y);
        y += 5;
      }
    });

    y += 5;
  }

  // ── Terms & Conditions ──
  if (invoice.terms_conditions && invoice.terms_conditions.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Terms & Conditions', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);

    invoice.terms_conditions.forEach((term, i) => {
      if (y > 275) { doc.addPage(); y = margin; }
      const text = `${i + 1}. ${term.text}`;
      const lines = doc.splitTextToSize(text, contentWidth - 5);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 2;
    });

    y += 5;
  }

  // ── Notes ──
  if (invoice.notes) {
    if (y > 250) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Notes', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 5);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 5;
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(
      `Generated by Pyra Workspace — Page ${i} of ${pageCount}`,
      pageWidth / 2,
      292,
      { align: 'center' }
    );
  }

  // Save
  doc.save(`invoice-${invoice.invoice_number}.pdf`);
}

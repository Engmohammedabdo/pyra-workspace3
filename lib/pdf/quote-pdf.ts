'use client';

import jsPDF from 'jspdf';

// ============================================================
// Quote PDF Generator — Arabic RTL Support
// Uses jsPDF to generate professional quote PDFs
// ============================================================

interface QuoteItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface QuoteData {
  quote_number: string;
  estimate_date: string;
  expiry_date: string | null;
  status: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  terms_conditions: Array<{ text: string }>;
  bank_details: {
    bank: string;
    account_name: string;
    account_no: string;
    iban: string;
  };
  company_name: string | null;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  project_name: string | null;
  signature_data: string | null;
  signed_by: string | null;
  signed_at: string | null;
  items: QuoteItem[];
}

const ORANGE = '#f97316';
const DARK = '#18181b';
const GRAY = '#71717a';
const LIGHT_GRAY = '#f4f4f5';

function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  viewed: 'تمت المشاهدة',
  signed: 'مُوقع',
  expired: 'منتهي',
  cancelled: 'ملغي',
};

/**
 * Generate and download a PDF for a quote.
 * Uses jsPDF with basic Arabic text support (left-aligned for numbers, right-aligned for labels).
 */
export function generateQuotePDF(quote: QuoteData) {
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
  doc.text(quote.company_name || 'Pyra Workspace', pageWidth / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('QUOTATION / ESTIMATE', pageWidth / 2, 28, { align: 'center' });

  y = 45;

  // ── Quote Info ──
  doc.setTextColor(24, 24, 27); // DARK
  doc.setFontSize(10);

  // Left side: Quote details
  doc.setFont('helvetica', 'bold');
  doc.text('Quote No:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(quote.quote_number, margin + 28, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Date:', margin, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(quote.estimate_date), margin + 28, y + 6);

  if (quote.expiry_date) {
    doc.setFont('helvetica', 'bold');
    doc.text('Expiry:', margin, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(quote.expiry_date), margin + 28, y + 12);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Status:', margin, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(STATUS_LABELS[quote.status] || quote.status, margin + 28, y + 18);

  // Right side: Client details
  const rightCol = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', rightCol, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  if (quote.client_name) {
    doc.text(quote.client_name, rightCol, y + 6, { align: 'right' });
  }
  if (quote.client_company) {
    doc.text(quote.client_company, rightCol, y + 12, { align: 'right' });
  }
  if (quote.client_email) {
    doc.setTextColor(113, 113, 122); // GRAY
    doc.text(quote.client_email, rightCol, y + 18, { align: 'right' });
  }
  if (quote.client_phone) {
    doc.text(quote.client_phone, rightCol, y + 24, { align: 'right' });
  }

  y += 35;

  // ── Project name ──
  if (quote.project_name) {
    doc.setTextColor(24, 24, 27);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Project: ${quote.project_name}`, margin, y);
    y += 10;
  }

  // ── Items Table ──
  // Table header
  doc.setFillColor(244, 244, 245); // LIGHT_GRAY
  doc.rect(margin, y, contentWidth, 8, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(24, 24, 27);

  const col1 = margin + 2; // #
  const col2 = margin + 12; // Description
  const col3 = margin + contentWidth - 60; // Qty
  const col4 = margin + contentWidth - 40; // Rate
  const col5 = margin + contentWidth - 2; // Amount

  doc.text('#', col1, y + 5.5);
  doc.text('Description', col2, y + 5.5);
  doc.text('Qty', col3, y + 5.5);
  doc.text('Rate', col4, y + 5.5);
  doc.text('Amount', col5, y + 5.5, { align: 'right' });

  y += 8;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  quote.items.forEach((item, index) => {
    // Check page break
    if (y > 260) {
      doc.addPage();
      y = margin;
    }

    const rowY = y + 5;

    // Alternating row background
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 8, 'F');
    }

    doc.setTextColor(24, 24, 27);
    doc.text(String(index + 1), col1, rowY);
    // Truncate description if too long
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
  doc.text(formatCurrency(quote.subtotal, quote.currency), totalsValueX, y, { align: 'right' });
  y += 6;

  // Tax
  doc.setTextColor(113, 113, 122);
  doc.text(`Tax (${quote.tax_rate}%):`, totalsX, y);
  doc.setTextColor(24, 24, 27);
  doc.text(formatCurrency(quote.tax_amount, quote.currency), totalsValueX, y, { align: 'right' });
  y += 8;

  // Total
  doc.setFillColor(249, 115, 22);
  doc.rect(totalsX - 5, y - 4.5, contentWidth - (totalsX - margin) + 7, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL:', totalsX, y + 2);
  doc.text(formatCurrency(quote.total, quote.currency), totalsValueX, y + 2, { align: 'right' });

  y += 18;

  // ── Bank Details ──
  if (quote.bank_details && quote.bank_details.bank) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Bank Details', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(113, 113, 122);

    const bankInfo = [
      ['Bank:', quote.bank_details.bank],
      ['Account:', quote.bank_details.account_name],
      ['Account No:', quote.bank_details.account_no],
      ['IBAN:', quote.bank_details.iban],
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
  if (quote.terms_conditions && quote.terms_conditions.length > 0) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Terms & Conditions', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);

    quote.terms_conditions.forEach((term, i) => {
      if (y > 275) { doc.addPage(); y = margin; }
      const text = `${i + 1}. ${term.text}`;
      const lines = doc.splitTextToSize(text, contentWidth - 5);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 2;
    });

    y += 5;
  }

  // ── Notes ──
  if (quote.notes) {
    if (y > 250) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Notes', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    const noteLines = doc.splitTextToSize(quote.notes, contentWidth - 5);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 5;
  }

  // ── Signature ──
  if (quote.signature_data && quote.signed_by) {
    if (y > 240) { doc.addPage(); y = margin; }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Signature', margin, y);
    y += 4;

    try {
      doc.addImage(quote.signature_data, 'PNG', margin, y, 50, 20);
      y += 22;
    } catch {
      y += 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text(`Signed by: ${quote.signed_by}`, margin, y);
    if (quote.signed_at) {
      doc.text(`Date: ${formatDate(quote.signed_at)}`, margin, y + 4);
    }
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
  doc.save(`quote-${quote.quote_number}.pdf`);
}

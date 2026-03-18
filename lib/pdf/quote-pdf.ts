'use client';

import jsPDF from 'jspdf';
import { registerArabicFont, loadImageAsBase64 } from './pdf-fonts';

// ============================================================
// Quote PDF Generator — Professional Design
// Matches Pyramedia X brand identity
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
  company_logo: string | null;
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

// ── Colors ──
const ORANGE = '#f97316';
const DARK = '#18181b';
const GRAY = '#71717a';
const BORDER = '#d4d4d4';
const LIGHT_BG = '#f5f5f5';

// ── Footer ──
const FOOTER_PHONE = '+971 565799505';
const FOOTER_SOCIAL = 'PYRAMEDIA.DXB';
const FOOTER_WEB = 'WWW.PYRAMEDIA.INFO - WWW.PYRAMEDIA.AI';

// ── Fixed Terms ──
const FIXED_TERMS: Record<string, string[]> = {
  'Payment': [
    '- Projects below AED 5,000 require 100% advance payment.',
    '- Projects above AED 5,000 require 50% advance payment, with the balance payable upon final delivery before release of assets.',
  ],
  'Scope & Revisions': [
    '- This quotation is based on the agreed scope.',
    '- Any changes outside scope will be charged additionally.',
    '- Includes up to 2 revision rounds unless stated otherwise.',
  ],
  'Validity': [
    '- This quotation is valid for 7 days from the issue date.',
  ],
  'Delivery': [
    '- Timelines start after advance payment and final brief approval.',
    '- Client delays may affect delivery schedules.',
  ],
  'Cancellation': [
    '- Cancellation within 24 hours: 100% charge.',
    '- Cancellation within 48 hours: 75% charge.',
    '- Completed work is fully chargeable.',
  ],
  'Overtime': [
    '- Overtime is charged at AED 500/hour unless agreed otherwise.',
  ],
  'Intellectual Property': [
    '- All materials remain the service provider\'s property until full payment.',
    '- Usage rights are granted upon full payment for the agreed purpose only.',
  ],
  'Liability': [
    '- Liability is limited to the total value of this quotation.',
  ],
  'Governing Law': [
    '- UAE law applies. Jurisdiction: DIFC Courts.',
  ],
  'Acceptance': [
    '- Advance payment or written confirmation confirms full acceptance of these terms.',
  ],
};

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function dashedLine(doc: jsPDF, x1: number, yPos: number, x2: number) {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.15);
  let x = x1;
  while (x < x2) {
    const end = Math.min(x + 1.2, x2);
    doc.line(x, yPos, end, yPos);
    x = end + 0.8;
  }
}

// Helper: render text, using Amiri for Arabic, Helvetica for English
function smartText(doc: jsPDF, text: string, x: number, yPos: number, arFn: (t: string) => string, opts?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }) {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  if (hasArabic) {
    doc.setFont('Amiri', 'normal');
    const processed = arFn(text);
    if (opts?.maxWidth) {
      const lines = doc.splitTextToSize(processed, opts.maxWidth);
      doc.text(lines, x, yPos, opts?.align ? { align: opts.align } : undefined);
      return lines.length;
    }
    doc.text(processed, x, yPos, opts?.align ? { align: opts.align } : undefined);
  } else {
    if (opts?.maxWidth) {
      const lines = doc.splitTextToSize(text, opts.maxWidth);
      doc.text(lines, x, yPos, opts?.align ? { align: opts.align } : undefined);
      return lines.length;
    }
    doc.text(text, x, yPos, opts?.align ? { align: opts.align } : undefined);
  }
  return 1;
}

/**
 * Generate and download a professional PDF for a quote.
 */
export async function generateQuotePDF(quote: QuoteData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await registerArabicFont(doc);
  const arText = (t: string) => doc.processArabic(t);

  const pw = 210;
  const m = 15;
  const cw = pw - m * 2;
  let y = 0;

  // ── Load logo: try local first, then company_logo URL ──
  let logoData: string | null = null;
  try {
    logoData = await loadImageAsBase64('/images/pyramediax-logo.png');
  } catch { /* ignore */ }
  if (!logoData && quote.company_logo) {
    try {
      logoData = await loadImageAsBase64(quote.company_logo);
    } catch { /* ignore */ }
  }

  // ════════════════════════════════════════════════
  // HEADER: Logo/Company + Client Info
  // ════════════════════════════════════════════════
  y = 14;

  // -- Left: Logo + Company Name --
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', m, y - 4, 24, 24);
    } catch { logoData = null; }
  }

  // Company name text (below logo if logo exists, or standalone)
  const companyNameY = logoData ? y + 24 : y + 8;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(ORANGE);
  doc.text(quote.company_name || 'PYRAMEDIA X', m, companyNameY);

  // -- Right: Client info with labels + dashed lines --
  const cInfoX = 80; // start of client info area
  const cValX = cInfoX + 22; // start of values
  const cMidX = 145; // second column label
  const cMidValX = cMidX + 22;
  const lineEndLeft = cMidX - 5;
  const lineEndRight = pw - m;

  // Row 1: Client + Email + Address
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(DARK);
  doc.text('Client:', cInfoX, y);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_company || quote.client_name || '---').slice(0, 20), cValX, y);
  dashedLine(doc, cValX, y + 1, lineEndLeft);

  doc.setFont('helvetica', 'bold');
  doc.text('Email:', cMidX, y);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_email || '---').slice(0, 22), cMidValX, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Address:', pw - m - 30, y);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_address || '---').slice(0, 12), pw - m - 12, y);

  // Row 2: Contact + Phone
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Contact:', cInfoX, y);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_name || '---').slice(0, 20), cValX, y);
  dashedLine(doc, cValX, y + 1, lineEndLeft);

  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', cMidX, y);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_phone || '---').slice(0, 20), cMidValX, y);
  dashedLine(doc, cMidValX, y + 1, lineEndRight);

  y = Math.max(companyNameY + 4, y + 6);

  // ── Orange separator ──
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(1.2);
  doc.line(m, y, pw - m, y);
  y += 6;

  // ════════════════════════════════════════════════
  // QUOTE DETAILS: 4-column grid
  // ════════════════════════════════════════════════
  const gw = cw / 4;
  const labels = ['invoice', 'Estimate Date', 'Expiry Date', 'Project Name'];
  const values = [
    quote.quote_number,
    fmtDate(quote.estimate_date),
    quote.expiry_date ? fmtDate(quote.expiry_date) : '---',
    quote.project_name || '---',
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(DARK);
  for (let i = 0; i < 4; i++) doc.text(labels[i], m + i * gw, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 4; i++) {
    if (i === 3 && quote.project_name) {
      doc.setFont('Amiri', 'normal');
      doc.setFontSize(9);
      doc.text(arText(quote.project_name).slice(0, 28), m + i * gw, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
    } else {
      doc.text(values[i], m + i * gw, y);
    }
  }

  y += 8;

  // ── Orange line ──
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 6;

  // ════════════════════════════════════════════════
  // ITEMS TABLE
  // ════════════════════════════════════════════════
  const descEndX = m + cw - 60;
  const qtyX = descEndX;
  const rateX = qtyX + 20;
  const amtX = pw - m;

  // Header row
  doc.setFillColor(ORANGE);
  doc.rect(m, y - 2, 3, 3, 'F'); // orange square

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(DARK);
  doc.text('ITEM & DESCRIPTION', m + 6, y);
  doc.text('QTY', qtyX + 8, y, { align: 'center' });
  doc.text('RATE', rateX + 8, y, { align: 'center' });
  doc.text('AMOUNT', amtX, y, { align: 'right' });

  y += 3;
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);
  y += 1;

  // Rows
  const rowH = 10;
  const minRows = Math.max(quote.items.length, 3);

  for (let i = 0; i < minRows; i++) {
    if (y > 240) { doc.addPage(); y = m; }
    const item = quote.items[i];
    const rowTop = y;

    // Cell borders
    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.15);
    doc.rect(m, rowTop, descEndX - m, rowH);
    doc.rect(descEndX, rowTop, 20, rowH);
    doc.rect(rateX, rowTop, 20, rowH);
    doc.rect(rateX + 20, rowTop, amtX - rateX - 20, rowH);

    if (item) {
      doc.setTextColor(DARK);
      doc.setFontSize(8.5);
      // Description
      doc.setFont('Amiri', 'normal');
      const desc = item.description.length > 55 ? item.description.slice(0, 55) + '...' : item.description;
      doc.text(arText(desc), m + 2, rowTop + 6.5);
      doc.setFont('helvetica', 'normal');
      // Numbers
      doc.text(String(item.quantity), qtyX + 10, rowTop + 6.5, { align: 'center' });
      doc.text(fmtNum(item.rate), rateX + 10, rowTop + 6.5, { align: 'center' });
      doc.text(fmtNum(item.amount), amtX - 2, rowTop + 6.5, { align: 'right' });
    }
    y += rowH;
  }

  y += 10;

  // ════════════════════════════════════════════════
  // TOTAL BOX
  // ════════════════════════════════════════════════
  const bw = 52;
  const bx = pw - m - bw;
  const hasTax = quote.tax_amount > 0;
  const bh = hasTax ? 22 : 12;

  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.6);
  doc.roundedRect(bx, y, bw, bh, 1.5, 1.5);

  if (hasTax) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GRAY);
    doc.text('Subtotal:', bx + 3, y + 5);
    doc.text(fmtNum(quote.subtotal), bx + bw - 3, y + 5, { align: 'right' });
    doc.text(`VAT (${quote.tax_rate}%):`, bx + 3, y + 10);
    doc.text(fmtNum(quote.tax_amount), bx + bw - 3, y + 10, { align: 'right' });
    doc.setDrawColor(BORDER);
    doc.line(bx + 2, y + 13, bx + bw - 2, y + 13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(ORANGE);
    doc.text(fmtNum(quote.total), bx + bw / 2, y + 20, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(ORANGE);
    doc.text(fmtNum(quote.total), bx + bw / 2, y + 8, { align: 'center' });
  }

  y += bh + 6;

  // ════════════════════════════════════════════════
  // NOTES (using Amiri for Arabic support)
  // ════════════════════════════════════════════════
  if (quote.notes) {
    if (y > 235) { doc.addPage(); y = m; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(DARK);
    doc.text('Notes:', m, y);

    y += 4;
    doc.setFontSize(7.5);
    doc.setTextColor(GRAY);
    // Use Amiri for notes since they may contain Arabic
    doc.setFont('Amiri', 'normal');
    const noteLines = doc.splitTextToSize(arText(quote.notes), cw);
    doc.text(noteLines, m, y);
    doc.setFont('helvetica', 'normal');
    y += noteLines.length * 3.5 + 4;
  }

  // ════════════════════════════════════════════════
  // BANK DETAILS
  // ════════════════════════════════════════════════
  if (quote.bank_details?.bank) {
    if (y > 225) { doc.addPage(); y = m; }

    doc.setDrawColor(BORDER);
    doc.setLineWidth(0.3);
    doc.line(m, y, pw - m, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(DARK);
    doc.text('Bank account details', m, y);
    y += 4;

    // Table: 2 rows × 3 columns — label on top, value below
    const bc = cw / 3;
    const bankRows = [
      [
        { label: 'Name of the bank:', value: quote.bank_details.bank },
        { label: 'Account name:', value: quote.bank_details.account_name },
        { label: 'Account Class:', value: 'CURRENT ACCOUNT' },
      ],
      [
        { label: 'Account Type:', value: 'AED - Business Current Acc' },
        { label: 'Account No:', value: quote.bank_details.account_no },
        { label: 'IBAN:', value: quote.bank_details.iban },
      ],
    ];

    for (const row of bankRows) {
      for (let c = 0; c < 3; c++) {
        const cx = m + c * bc;
        doc.setDrawColor(BORDER);
        doc.setLineWidth(0.15);
        doc.rect(cx, y, bc, 8);

        // Label (small gray)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(GRAY);
        doc.text(row[c].label, cx + 2, y + 3);

        // Value (bold dark)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(DARK);
        const val = row[c].value.length > 30 ? row[c].value.slice(0, 30) + '...' : row[c].value;
        doc.text(val, cx + 2, y + 6.5);
      }
      y += 8;
    }

    y += 3;
  }

  // ════════════════════════════════════════════════
  // TERMS & CONDITIONS (3-column layout)
  // ════════════════════════════════════════════════
  if (y > 195) { doc.addPage(); y = m; }

  doc.setDrawColor(DARK);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text('TERMS & CONDITIONS', m, y);
  doc.setLineWidth(0.2);
  doc.line(m, y + 1, m + 40, y + 1);
  y += 5;

  // Split terms into 3 columns
  const termKeys = Object.keys(FIXED_TERMS);
  const cols = [termKeys.slice(0, 4), termKeys.slice(4, 7), termKeys.slice(7)];
  const tcw = (cw - 6) / 3;

  const termStartY = y;
  for (let ci = 0; ci < 3; ci++) {
    let ty = termStartY;
    const cx = m + ci * (tcw + 3);

    for (const key of cols[ci]) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(DARK);
      doc.text(key, cx, ty);
      ty += 2.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(GRAY);
      for (const line of FIXED_TERMS[key]) {
        const wrapped = doc.splitTextToSize(line, tcw);
        doc.text(wrapped, cx, ty);
        ty += wrapped.length * 2 + 0.3;
      }
      ty += 1.5;
    }
    y = Math.max(y, ty);
  }

  // Custom terms from data
  if (quote.terms_conditions?.length > 0) {
    y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(GRAY);
    for (const term of quote.terms_conditions) {
      if (y > 278) { doc.addPage(); y = m; }
      const wrapped = doc.splitTextToSize(`• ${term.text}`, cw);
      doc.text(wrapped, m, y);
      y += wrapped.length * 2.2 + 0.5;
    }
  }

  // ════════════════════════════════════════════════
  // SIGNATURE
  // ════════════════════════════════════════════════
  if (quote.signature_data && quote.signed_by) {
    if (y > 245) { doc.addPage(); y = m; }

    y += 3;
    doc.setDrawColor(BORDER);
    doc.line(m, y, pw - m, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(DARK);
    doc.text('Signature', m, y);
    y += 3;

    try {
      doc.addImage(quote.signature_data, 'PNG', m, y, 42, 16);
      y += 18;
    } catch {
      y += 2;
    }

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.text(`Signed by: ${arText(quote.signed_by)}`, m, y);
    if (quote.signed_at) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${fmtDate(quote.signed_at)}`, m, y + 4);
    }
  }

  // ════════════════════════════════════════════════
  // FOOTER (on every page)
  // ════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const fy = 284;

    // Orange line
    doc.setDrawColor(ORANGE);
    doc.setLineWidth(0.6);
    doc.line(m, fy, pw - m, fy);

    // Phone icon (orange circle with T)
    doc.setFillColor(ORANGE);
    doc.circle(m + 2, fy + 4, 1.6, 'F');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('T', m + 2, fy + 4.6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(DARK);
    doc.text(FOOTER_PHONE, m + 6, fy + 4.5);

    // 3 orange dots
    const cx = pw / 2 - 10;
    doc.setFillColor(ORANGE);
    doc.circle(cx, fy + 4, 1, 'F');
    doc.circle(cx + 3.5, fy + 4, 1, 'F');
    doc.circle(cx + 7, fy + 4, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(FOOTER_SOCIAL, cx + 12, fy + 4.5);

    // Web icon (orange circle with @)
    doc.setFillColor(ORANGE);
    doc.circle(m + 2, fy + 8.5, 1.6, 'F');
    doc.setFontSize(5);
    doc.setTextColor(255, 255, 255);
    doc.text('@', m + 2, fy + 9.1, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(ORANGE);
    doc.text(FOOTER_WEB, m + 6, fy + 9);
  }

  doc.save(`quote-${quote.quote_number}.pdf`);
}

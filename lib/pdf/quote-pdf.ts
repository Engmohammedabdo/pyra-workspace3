'use client';

import jsPDF from 'jspdf';
import { registerArabicFont, loadImageAsBase64 } from './pdf-fonts';

// ============================================================
// Quote PDF Generator — Professional Design
// Matches Pyramedia X brand identity: orange accent, clean grid,
// multi-column T&C, logo support, bank detail table, branded footer.
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

// ── Brand Colors ──
const ORANGE = '#f97316';
const DARK = '#18181b';
const GRAY = '#71717a';
const LIGHT_BORDER = '#e5e5e5';

// ── Footer Info (company contact) ──
const FOOTER_PHONE = '+971 565799505';
const FOOTER_SOCIAL = 'PYRAMEDIA.DXB';
const FOOTER_WEB = 'WWW.PYRAMEDIA.INFO - WWW.PYRAMEDIA.AI';

// ── Fixed Terms & Conditions ──
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

/**
 * Draw a dashed line (simulated with small segments).
 */
function dashedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const dashLen = 1.5;
  const gapLen = 1;
  let x = x1;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  while (x < x2) {
    const end = Math.min(x + dashLen, x2);
    doc.line(x, y, end, y);
    x = end + gapLen;
  }
}

/**
 * Generate and download a professional PDF for a quote.
 */
export async function generateQuotePDF(quote: QuoteData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  await registerArabicFont(doc);
  const arText = (t: string) => doc.processArabic(t);

  const pw = 210;    // page width
  const ph = 297;    // page height
  const m = 15;      // margin
  const cw = pw - m * 2; // content width
  let y = 0;

  // ── Try to load company logo ──
  let logoData: string | null = null;
  if (quote.company_logo) {
    logoData = await loadImageAsBase64(quote.company_logo);
  }

  // ════════════════════════════════════════════════════════
  // SECTION 1: HEADER — Logo + Company + Client Info
  // ════════════════════════════════════════════════════════
  y = 15;

  // Logo or text fallback
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', m, y - 2, 28, 28);
    } catch {
      // Fallback to text
      doc.setFont('Amiri', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(ORANGE);
      doc.text(arText(quote.company_name || 'PYRAMEDIA X'), m, y + 10);
    }
  } else {
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(ORANGE);
    doc.text(arText(quote.company_name || 'PYRAMEDIA X'), m, y + 10);
  }

  // Company name under logo
  if (logoData) {
    doc.setFont('Amiri', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(DARK);
    doc.text(arText(quote.company_name || 'PYRAMEDIA X'), m, y + 32);
  }

  // Client info — right side with dashed underlines
  const clientStartX = 80;
  const clientLabelW = 25;
  const clientValueX = clientStartX + clientLabelW + 2;
  const clientEndX = pw - m;
  let cy = y;

  const clientFields = [
    { label: 'Client:', value: quote.client_company || quote.client_name || '---' },
    { label: 'Email:', value: quote.client_email || '---' },
    { label: 'Contact:', value: quote.client_name || '---' },
    { label: 'Phone:', value: quote.client_phone || '---' },
    { label: 'Address:', value: quote.client_address || '---' },
  ];

  // Draw in 2 columns: left 2 (Client, Contact) and right 2 (Email, Phone, Address)
  const leftFields = [clientFields[0], clientFields[2]]; // Client, Contact
  const rightFields = [clientFields[1], clientFields[3]]; // Email, Phone

  const col1X = clientStartX;
  const col2X = clientStartX + 60;

  // Row 1: Client + Email
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text('Client:', col1X, cy);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(DARK);
  doc.text(clientFields[0].value.slice(0, 25), col1X + 18, cy);
  dashedLine(doc, col1X + 18, cy + 1, col2X - 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Email:', col2X, cy);
  doc.setFont('helvetica', 'normal');
  doc.text(clientFields[1].value.slice(0, 30), col2X + 18, cy);
  dashedLine(doc, col2X + 18, cy + 1, clientEndX);

  // Also address on same row far right
  doc.setFont('helvetica', 'bold');
  doc.text('Address:', pw - m - 40, cy);
  doc.setFont('helvetica', 'normal');
  doc.text(clientFields[4].value.slice(0, 15), pw - m - 20, cy);

  cy += 9;

  // Row 2: Contact + Phone
  doc.setFont('helvetica', 'bold');
  doc.text('Contact:', col1X, cy);
  doc.setFont('helvetica', 'normal');
  doc.text(clientFields[2].value.slice(0, 25), col1X + 22, cy);
  dashedLine(doc, col1X + 22, cy + 1, col2X - 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', col2X, cy);
  doc.setFont('helvetica', 'normal');
  doc.text(clientFields[3].value.slice(0, 20), col2X + 18, cy);
  dashedLine(doc, col2X + 18, cy + 1, clientEndX);

  y = Math.max(logoData ? y + 40 : y + 20, cy + 8);

  // ── Orange separator line ──
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(1);
  doc.line(m, y, pw - m, y);

  // ════════════════════════════════════════════════════════
  // SECTION 2: QUOTE DETAILS GRID
  // ════════════════════════════════════════════════════════
  y += 6;
  const gridCols = 4;
  const gridW = cw / gridCols;

  const detailLabels = ['invoice', 'Estimate Date', 'Expiry Date', 'Project Name'];
  const detailValues = [
    quote.quote_number,
    fmtDate(quote.estimate_date),
    quote.expiry_date ? fmtDate(quote.expiry_date) : '---',
    quote.project_name || '---',
  ];

  // Labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  for (let i = 0; i < gridCols; i++) {
    doc.text(detailLabels[i], m + i * gridW, y);
  }

  y += 5;

  // Values
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  for (let i = 0; i < gridCols; i++) {
    const val = i === 3 && quote.project_name
      ? arText(quote.project_name)
      : detailValues[i];
    doc.setFont(i === 3 && quote.project_name ? 'Amiri' : 'helvetica', 'normal');
    doc.text(val.slice(0, 25), m + i * gridW, y);
  }

  y += 8;

  // ── Orange separator line ──
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.line(m, y, pw - m, y);

  // ════════════════════════════════════════════════════════
  // SECTION 3: ITEMS TABLE
  // ════════════════════════════════════════════════════════
  y += 6;

  // Table header
  const tblX = m;
  const descW = cw - 60;
  const qtyX = m + descW;
  const rateX = qtyX + 20;
  const amtX = pw - m;

  // Orange square + header text
  doc.setFillColor(ORANGE);
  doc.rect(tblX, y - 1.5, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text('ITEM & DESCRIPTION', tblX + 6, y + 1);
  doc.text('QTY', qtyX, y + 1);
  doc.text('RATE', rateX, y + 1);
  doc.text('AMOUNT', amtX, y + 1, { align: 'right' });

  y += 4;

  // Orange line under header
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.line(tblX, y, pw - m, y);

  y += 2;

  // Item rows
  const rowH = 10;
  const minRows = 3; // Always show at least 3 rows
  const totalRows = Math.max(quote.items.length, minRows);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  for (let i = 0; i < totalRows; i++) {
    if (y > 245) {
      doc.addPage();
      y = m;
    }

    const rowTop = y;
    const item = quote.items[i];

    // Row borders
    doc.setDrawColor(LIGHT_BORDER);
    doc.setLineWidth(0.2);
    doc.line(tblX, rowTop, pw - m, rowTop); // top line
    // Vertical lines
    doc.line(tblX, rowTop, tblX, rowTop + rowH);
    doc.line(qtyX - 2, rowTop, qtyX - 2, rowTop + rowH);
    doc.line(rateX - 2, rowTop, rateX - 2, rowTop + rowH);
    doc.line(amtX - 28, rowTop, amtX - 28, rowTop + rowH);
    doc.line(pw - m, rowTop, pw - m, rowTop + rowH);

    if (item) {
      doc.setTextColor(DARK);
      // Description (may need Arabic)
      doc.setFont('Amiri', 'normal');
      const desc = item.description.length > 60 ? item.description.slice(0, 60) + '...' : item.description;
      doc.text(arText(desc), tblX + 3, rowTop + 6.5);
      doc.setFont('helvetica', 'normal');
      // Qty
      doc.text(String(item.quantity), qtyX + 6, rowTop + 6.5, { align: 'center' });
      // Rate
      doc.text(fmtNum(item.rate), rateX + 6, rowTop + 6.5, { align: 'center' });
      // Amount
      doc.text(fmtNum(item.amount), amtX - 3, rowTop + 6.5, { align: 'right' });
    }

    y += rowH;
  }
  // Bottom border of last row
  doc.setDrawColor(LIGHT_BORDER);
  doc.line(tblX, y, pw - m, y);

  y += 10;

  // ════════════════════════════════════════════════════════
  // SECTION 4: TOTAL BOX
  // ════════════════════════════════════════════════════════
  const boxW = 55;
  const boxH = quote.tax_amount > 0 ? 24 : 12;
  const boxX = pw - m - boxW;

  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2);

  if (quote.tax_amount > 0) {
    // Subtotal
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.text('Subtotal:', boxX + 3, y + 5);
    doc.text(fmtNum(quote.subtotal), boxX + boxW - 3, y + 5, { align: 'right' });

    // Tax
    doc.text(`VAT (${quote.tax_rate}%):`, boxX + 3, y + 10);
    doc.text(fmtNum(quote.tax_amount), boxX + boxW - 3, y + 10, { align: 'right' });

    // Separator
    doc.setDrawColor(LIGHT_BORDER);
    doc.line(boxX + 2, y + 13, boxX + boxW - 2, y + 13);

    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(ORANGE);
    doc.text(fmtNum(quote.total), boxX + boxW / 2, y + 21, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(ORANGE);
    doc.text(fmtNum(quote.total), boxX + boxW / 2, y + 8, { align: 'center' });
  }

  y += boxH + 8;

  // ════════════════════════════════════════════════════════
  // SECTION 5: NOTES
  // ════════════════════════════════════════════════════════
  if (quote.notes) {
    if (y > 240) { doc.addPage(); y = m; }

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(GRAY);

    const notePrefix = 'Notes: ';
    const noteLines = doc.splitTextToSize(notePrefix + quote.notes, cw);
    doc.text(noteLines, m, y);
    y += noteLines.length * 3.5 + 4;
  }

  // ════════════════════════════════════════════════════════
  // SECTION 6: BANK ACCOUNT DETAILS
  // ════════════════════════════════════════════════════════
  if (quote.bank_details && quote.bank_details.bank) {
    if (y > 230) { doc.addPage(); y = m; }

    // Separator
    doc.setDrawColor(LIGHT_BORDER);
    doc.setLineWidth(0.3);
    doc.line(m, y, pw - m, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(DARK);
    doc.text('Bank account details', m, y);
    y += 5;

    // Bank detail table — 2 rows × 3 columns
    const bankTblW = cw;
    const bankColW = bankTblW / 3;
    const bankRowH = 8;

    const bankData = [
      [
        { label: 'Name of the bank:', value: quote.bank_details.bank },
        { label: 'Account name:', value: quote.bank_details.account_name },
        { label: 'Account Class:', value: 'CURRENT ACCOUNT' },
      ],
      [
        { label: 'Account Type:', value: 'AED - Business Connect Current Acc' },
        { label: 'Account No:', value: quote.bank_details.account_no },
        { label: 'IBAN:', value: quote.bank_details.iban },
      ],
    ];

    doc.setFontSize(7);

    for (let row = 0; row < bankData.length; row++) {
      const rowY = y + row * bankRowH;

      for (let col = 0; col < 3; col++) {
        const cellX = m + col * bankColW;
        const cell = bankData[row][col];

        // Cell borders
        doc.setDrawColor(LIGHT_BORDER);
        doc.setLineWidth(0.2);
        doc.rect(cellX, rowY, bankColW, bankRowH);

        // Label
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(GRAY);
        doc.text(cell.label, cellX + 2, rowY + 3.5);

        // Value
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(DARK);
        const maxValueW = bankColW - (doc.getTextWidth(cell.label) + 6);
        const truncatedValue = cell.value.length > 35 ? cell.value.slice(0, 35) + '...' : cell.value;
        doc.text(truncatedValue, cellX + 2 + doc.getTextWidth(cell.label) + 3, rowY + 3.5);
      }
    }

    y += bankRowH * 2 + 4;
  }

  // ════════════════════════════════════════════════════════
  // SECTION 7: TERMS & CONDITIONS (3 columns)
  // ════════════════════════════════════════════════════════
  // Check if we need a new page for terms
  if (y > 200) { doc.addPage(); y = m; }

  // Separator
  doc.setDrawColor(DARK);
  doc.setLineWidth(0.3);
  doc.line(m, y, pw - m, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text('TERMS & CONDITIONS', m, y);
  y += 1;
  doc.setDrawColor(DARK);
  doc.setLineWidth(0.2);
  doc.line(m, y, m + 42, y);
  y += 4;

  // 3-column layout for terms
  const termKeys = Object.keys(FIXED_TERMS);
  const col1Terms = termKeys.slice(0, 4);   // Payment, Scope, Validity, Delivery
  const col2Terms = termKeys.slice(4, 7);   // Cancellation, Overtime, IP
  const col3Terms = termKeys.slice(7);      // Liability, Gov Law, Acceptance

  const termColW = cw / 3 - 2;
  const termFontSize = 5.5;
  const termTitleSize = 6.5;

  function drawTermColumn(doc: jsPDF, terms: string[], startX: number, startY: number): number {
    let ty = startY;
    for (const key of terms) {
      const lines = FIXED_TERMS[key];
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(termTitleSize);
      doc.setTextColor(DARK);
      doc.text(key, startX, ty);
      ty += 3;

      // Content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(termFontSize);
      doc.setTextColor(GRAY);
      for (const line of lines) {
        const wrapped = doc.splitTextToSize(line, termColW);
        doc.text(wrapped, startX, ty);
        ty += wrapped.length * 2.2 + 0.5;
      }
      ty += 1.5;
    }
    return ty;
  }

  const termStartY = y;
  drawTermColumn(doc, col1Terms, m, termStartY);
  drawTermColumn(doc, col2Terms, m + termColW + 3, termStartY);
  const termEndY = drawTermColumn(doc, col3Terms, m + (termColW + 3) * 2, termStartY);

  y = termEndY + 2;

  // Custom terms from data
  if (quote.terms_conditions && quote.terms_conditions.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(termFontSize);
    doc.setTextColor(GRAY);
    for (const term of quote.terms_conditions) {
      if (y > 275) { doc.addPage(); y = m; }
      const wrapped = doc.splitTextToSize(`• ${term.text}`, cw);
      doc.text(wrapped, m, y);
      y += wrapped.length * 2.2 + 1;
    }
  }

  // ════════════════════════════════════════════════════════
  // SECTION 8: SIGNATURE (if signed)
  // ════════════════════════════════════════════════════════
  if (quote.signature_data && quote.signed_by) {
    if (y > 250) { doc.addPage(); y = m; }

    y += 4;
    doc.setDrawColor(LIGHT_BORDER);
    doc.line(m, y, pw - m, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(DARK);
    doc.text('Signature', m, y);
    y += 3;

    try {
      doc.addImage(quote.signature_data, 'PNG', m, y, 45, 18);
      y += 20;
    } catch {
      y += 2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY);
    doc.setFont('Amiri', 'normal');
    doc.text(`Signed by: ${arText(quote.signed_by)}`, m, y);
    if (quote.signed_at) {
      doc.text(`Date: ${fmtDate(quote.signed_at)}`, m, y + 3.5);
    }
  }

  // ════════════════════════════════════════════════════════
  // SECTION 9: FOOTER (every page)
  // ════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const footerY = ph - 12;

    // Orange line
    doc.setDrawColor(ORANGE);
    doc.setLineWidth(0.5);
    doc.line(m, footerY, pw - m, footerY);

    // Phone
    doc.setFillColor(ORANGE);
    doc.circle(m + 2, footerY + 4.5, 1.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('T', m + 2, footerY + 5.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(DARK);
    doc.text(FOOTER_PHONE, m + 6, footerY + 5);

    // Three orange dots in center
    const centerX = pw / 2;
    doc.setFillColor(ORANGE);
    doc.circle(centerX - 4, footerY + 4.5, 1.2, 'F');
    doc.circle(centerX, footerY + 4.5, 1.2, 'F');
    doc.circle(centerX + 4, footerY + 4.5, 1.2, 'F');

    // Social handle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(DARK);
    doc.text(FOOTER_SOCIAL, centerX + 10, footerY + 5);

    // Website row
    doc.setFillColor(ORANGE);
    doc.circle(m + 2, footerY + 9, 1.8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text('@', m + 2, footerY + 9.7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(ORANGE);
    doc.text(FOOTER_WEB, m + 6, footerY + 9.5);
  }

  // Save
  doc.save(`quote-${quote.quote_number}.pdf`);
}

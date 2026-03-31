'use client';

import jsPDF from 'jspdf';
import { registerArabicFont, loadImageAsBase64 } from './pdf-fonts';

// ============================================================
// Quote PDF — Pyramedia X Professional Template
// Pixel-accurate recreation of the approved reference design.
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
  discount_type?: 'percentage' | 'fixed' | null;
  discount_value?: number;
  discount_amount?: number;
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

/* ── Design tokens ── */
const C = {
  orange: [249, 115, 22] as [number, number, number],
  dark: [24, 24, 27] as [number, number, number],
  gray: [113, 113, 122] as [number, number, number],
  lightGray: [160, 160, 165] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  lightBg: [245, 245, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};
const PW = 210;          // A4 width
const PH = 297;          // A4 height
const M = 15;            // margin
const CW = PW - M * 2;  // content width = 180mm

/* ── Helpers ── */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(s: string): string {
  try { const d = new Date(s); return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`; }
  catch { return s; }
}

/** Draw a dotted line (reference style) */
function dottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  for (let x = x1; x < x2; x += 1.8) {
    doc.line(x, y, Math.min(x + 0.8, x2), y);
  }
}

/* ── Fixed Terms (from reference image) ── */
const TERMS: Record<string, string[]> = {
  Payment: [
    '- Projects below AED 5,000 require 100% advance payment.',
    '- Projects above AED 5,000 require 50% advance payment, with the balance payable upon final delivery before release of assets.',
  ],
  'Scope & Revisions': [
    '- This quotation is based on the agreed scope.',
    '- Any changes outside scope will be charged additionally.',
    '- Includes up to 2 revision rounds unless stated otherwise.',
  ],
  Validity: ['- This quotation is valid for 7 days from the issue date.'],
  Delivery: [
    '- Timelines start after advance payment and final brief approval.',
    '- Client delays may affect delivery schedules.',
  ],
  Cancellation: [
    '- Cancellation within 24 hours: 100% charge.',
    '- Cancellation within 48 hours: 75% charge.',
    '- Completed work is fully chargeable.',
  ],
  Overtime: ['- Overtime is charged at AED 500/hour unless agreed otherwise.'],
  'Intellectual Property': [
    '- All materials remain the service provider\'s property until full payment.',
    '- Usage rights are granted upon full payment for the agreed purpose only.',
  ],
  Liability: ['- Liability is limited to the total value of this quotation.'],
  'Governing Law': ['- UAE law applies. Jurisdiction: DIFC Courts.'],
  Acceptance: ['- Advance payment or written confirmation confirms full acceptance of these terms.'],
};

const FOOTER = { phone: '+971 565799505', social: 'PYRAMEDIA.DXB', web: 'WWW.PYRAMEDIA.INFO - WWW.PYRAMEDIA.AI' };

// ============================================================
export async function generateQuotePDF(quote: QuoteData, options?: { returnBlob?: boolean }): Promise<Blob | void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerArabicFont(doc);
  const ar = (t: string) => doc.processArabic(t);
  let y = 0;

  // ── Load logo — prefer entity/record logo, fall back to default ──
  let logo: string | null = null;
  if (quote.company_logo) { try { logo = await loadImageAsBase64(quote.company_logo); } catch { /* */ } }
  if (!logo) { try { logo = await loadImageAsBase64('/images/pyramediax-logo.png'); } catch { /* */ } }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  HEADER — Logo (left) | Client Info (right)             ║
  // ╚══════════════════════════════════════════════════════════╝
  y = 10;

  // Logo — landscape aspect ratio (~2:1). Logo already contains "PYRAMEDIA X" text.
  const logoW = 52;
  const logoH = 22;
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, y, logoW, logoH); } catch { logo = null; }
  }
  // Company name text: always show below logo (or as fallback if no logo)
  if (!logo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.orange);
    doc.text(quote.company_name || 'PYRAMEDIA X', M, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.gray);
    doc.text(quote.company_name || '', M, y + 15);
  } else if (quote.company_name) {
    // Show company name as small text below logo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.gray);
    const nameLines = doc.splitTextToSize(quote.company_name, logoW);
    doc.text(nameLines, M, y + logoH + 3);
  }

  // Client info — right side, 2 rows with labels + dotted underlines
  const infoX = M + 68;  // start of client info block
  const midCol = M + 128; // second column of labels
  const endLine = PW - M;

  doc.setFontSize(8.5);

  // Row 1: Client: _____ | Email: _____
  let ry = y + 6;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Client:', infoX, ry);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  const clientVal = (quote.client_company || quote.client_name || '---');
  doc.text(clientVal.slice(0, 22), infoX + 14, ry);
  dottedLine(doc, infoX + 14, ry + 1.5, midCol - 3);

  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Email:', midCol, ry);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text((quote.client_email || '---').slice(0, 24), midCol + 13, ry);
  dottedLine(doc, midCol + 13, ry + 1.5, endLine);

  // Row 2: Contact: _____ | Phone: _____
  ry += 9;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Contact:', infoX, ry);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text((quote.client_name || '---').slice(0, 20), infoX + 17, ry);
  dottedLine(doc, infoX + 17, ry + 1.5, midCol - 3);

  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Phone:', midCol, ry);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text((quote.client_phone || '---').slice(0, 20), midCol + 13, ry);
  dottedLine(doc, midCol + 13, ry + 1.5, endLine);

  // Row 3: Address: _____
  ry += 9;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Address:', infoX, ry);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...C.gray);
  doc.text((quote.client_address || '---').slice(0, 50), infoX + 17, ry);
  dottedLine(doc, infoX + 17, ry + 1.5, endLine);

  y = Math.max(y + logoH + 4, ry + 6);

  // ── THICK ORANGE SEPARATOR ──
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(1.8);
  doc.line(M, y, PW - M, y);
  y += 8;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  QUOTE DETAILS — 4-column grid                          ║
  // ╚══════════════════════════════════════════════════════════╝
  const gw = CW / 4;
  const gLabels = ['invoice', 'Estimate Date', 'Expiry Date', 'Project Name'];
  const gValues = [
    quote.quote_number,
    fmtDate(quote.estimate_date),
    quote.expiry_date ? fmtDate(quote.expiry_date) : '---',
    quote.project_name || '---',
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  for (let i = 0; i < 4; i++) doc.text(gLabels[i], M + i * gw, y);

  y += 1.5;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  doc.line(M, y, PW - M, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.gray);
  for (let i = 0; i < 4; i++) {
    if (i === 3 && quote.project_name) {
      doc.setFont('Amiri', 'normal');
      doc.text(ar(quote.project_name).slice(0, 30), M + i * gw, y);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text(gValues[i], M + i * gw, y);
    }
  }

  y += 8;

  // ── Thin orange line under details ──
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.6);
  doc.line(M, y, PW - M, y);
  y += 8;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ITEMS TABLE                                             ║
  // ╚══════════════════════════════════════════════════════════╝
  // Column layout
  const colDesc = M;
  const colQty = M + CW - 60;
  const colRate = M + CW - 40;
  const colAmt = M + CW - 20;
  const colEnd = PW - M;

  // Header row
  doc.setFillColor(...C.orange);
  doc.rect(M, y - 2.5, 3, 3, 'F');  // small orange square icon

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('ITEM & DESCRIPTION', M + 6, y);
  doc.text('QTY', colQty + 10, y, { align: 'center' });
  doc.text('RATE', colRate + 10, y, { align: 'center' });
  doc.text('AMOUNT', colEnd - 2, y, { align: 'right' });

  y += 3;
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.7);
  doc.line(M, y, PW - M, y);
  y += 0.5;

  // Data rows
  const rowH = 11;
  const minRows = Math.max(quote.items.length, 3);

  for (let i = 0; i < minRows; i++) {
    if (y > 235) { doc.addPage(); y = M; }
    const item = quote.items[i];
    const top = y;

    // Cell borders — each cell outlined
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    // Description cell
    doc.rect(colDesc, top, colQty - colDesc, rowH);
    // QTY cell
    doc.rect(colQty, top, 20, rowH);
    // RATE cell
    doc.rect(colRate, top, 20, rowH);
    // AMOUNT cell
    doc.rect(colAmt, top, colEnd - colAmt, rowH);

    if (item) {
      const cy = top + rowH / 2 + 1.2;
      doc.setFontSize(8.5);
      doc.setTextColor(...C.dark);
      // Description (Arabic support)
      doc.setFont('Amiri', 'normal');
      const maxDescW = colQty - colDesc - 8;
      let desc = item.description;
      if (doc.getTextWidth(desc) > maxDescW) {
        while (doc.getTextWidth(desc + '...') > maxDescW && desc.length > 5) desc = desc.slice(0, -1);
        desc += '...';
      }
      doc.text(ar(desc), colDesc + 3, cy);
      // Numbers
      doc.setFont('helvetica', 'normal');
      doc.text(String(item.quantity), colQty + 10, cy, { align: 'center' });
      doc.text(fmtNum(item.rate), colRate + 10, cy, { align: 'center' });
      doc.text(fmtNum(item.amount), colEnd - 3, cy, { align: 'right' });
    }
    y += rowH;
  }

  y += 10;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  TOTAL BOX — right-aligned with orange border           ║
  // ╚══════════════════════════════════════════════════════════╝
  const boxW = 55;
  const boxX = PW - M - boxW;
  const hasTax = quote.tax_amount > 0;
  const hasDiscount = (quote.discount_amount || 0) > 0;
  const detailLines = 1 + (hasDiscount ? 1 : 0) + (hasTax ? 1 : 0); // subtotal + discount? + vat?
  const boxH = detailLines > 1 ? 12 + detailLines * 6 : 14;

  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.7);
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2);

  if (hasDiscount || hasTax) {
    let ly = y + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.gray);
    doc.text('Subtotal:', boxX + 4, ly);
    doc.text(fmtNum(quote.subtotal), boxX + boxW - 4, ly, { align: 'right' });

    if (hasDiscount) {
      ly += 6;
      const discLabel = quote.discount_type === 'percentage'
        ? `Discount (${quote.discount_value || 0}%):`
        : 'Discount:';
      doc.text(discLabel, boxX + 4, ly);
      doc.setTextColor(220, 38, 38);
      doc.text(`-${fmtNum(quote.discount_amount || 0)}`, boxX + boxW - 4, ly, { align: 'right' });
      doc.setTextColor(...C.gray);
    }

    if (hasTax) {
      ly += 6;
      doc.text(`VAT (${quote.tax_rate}%):`, boxX + 4, ly);
      doc.text(fmtNum(quote.tax_amount), boxX + boxW - 4, ly, { align: 'right' });
    }

    // Divider
    ly += 3;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.line(boxX + 3, ly, boxX + boxW - 3, ly);
    // Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...C.orange);
    doc.text(fmtNum(quote.total), boxX + boxW / 2, ly + 7, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...C.orange);
    doc.text(fmtNum(quote.total), boxX + boxW / 2, y + 10, { align: 'center' });
  }

  y += boxH + 8;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  NOTES (italic, Arabic support)                         ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.notes) {
    if (y > 230) { doc.addPage(); y = M; }

    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text('Notes:', M, y);
    y += 5;

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.gray);
    const noteLines = doc.splitTextToSize(ar(quote.notes), CW);
    doc.text(noteLines, M, y);
    y += noteLines.length * 3.8 + 5;
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  BANK ACCOUNT DETAILS                                    ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.bank_details?.bank) {
    if (y > 215) { doc.addPage(); y = M; }

    // Separator
    doc.setDrawColor(...C.dark);
    doc.setLineWidth(0.3);
    doc.line(M, y, PW - M, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.dark);
    doc.text('Bank account details', M, y);
    y += 5;

    // 2×3 grid table — label in gray, value in bold dark, side by side in each cell
    const bc = CW / 3;
    const cellH = 8;
    const bankRows = [
      [
        { l: 'Name of the bank: ', v: quote.bank_details.bank },
        { l: 'Account name: ', v: quote.bank_details.account_name },
        { l: 'Account Class: ', v: 'CURRENT ACCOUNT' },
      ],
      [
        { l: 'Account Type: ', v: 'AED' },
        { l: 'Account No: ', v: quote.bank_details.account_no },
        { l: 'IBAN: ', v: quote.bank_details.iban },
      ],
    ];

    for (const row of bankRows) {
      for (let c = 0; c < 3; c++) {
        const cx = M + c * bc;
        // Cell background + border
        doc.setFillColor(...C.lightBg);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.rect(cx, y, bc, cellH, 'FD');
        // Label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.lightGray);
        doc.text(row[c].l, cx + 2, y + cellH / 2 + 0.8);
        // Value — bold, dark, right after label
        const labelW = doc.getTextWidth(row[c].l);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.dark);
        const maxValW = bc - labelW - 5;
        let val = row[c].v;
        while (doc.getTextWidth(val) > maxValW && val.length > 3) val = val.slice(0, -1);
        if (val !== row[c].v) val += '…';
        doc.text(val, cx + labelW + 3, y + cellH / 2 + 0.8);
      }
      y += cellH;
    }

    y += 5;
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  TERMS & CONDITIONS (3-column layout)                    ║
  // ╚══════════════════════════════════════════════════════════╝
  if (y > 190) { doc.addPage(); y = M; }

  // Separator
  doc.setDrawColor(...C.dark);
  doc.setLineWidth(0.35);
  doc.line(M, y, PW - M, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('TERMS & CONDITIONS', M, y);
  // Underline
  doc.setDrawColor(...C.dark);
  doc.setLineWidth(0.3);
  doc.line(M, y + 1.2, M + 40, y + 1.2);
  y += 5;

  // Distribute terms into 3 columns
  const termKeys = Object.keys(TERMS);
  const tCols = [termKeys.slice(0, 4), termKeys.slice(4, 7), termKeys.slice(7)];
  const tw = (CW - 6) / 3;

  const tStartY = y;
  for (let ci = 0; ci < 3; ci++) {
    let ty = tStartY;
    const tx = M + ci * (tw + 3);

    for (const key of tCols[ci]) {
      // Term title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...C.dark);
      doc.text(key, tx, ty);
      ty += 2.8;

      // Term content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(...C.gray);
      for (const line of TERMS[key]) {
        const wrapped = doc.splitTextToSize(line, tw - 2);
        doc.text(wrapped, tx, ty);
        ty += wrapped.length * 2 + 0.4;
      }
      ty += 1.8;
    }
    y = Math.max(y, ty);
  }

  // Custom terms from quote data
  if (quote.terms_conditions?.length > 0) {
    y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.gray);
    for (const term of quote.terms_conditions) {
      if (y > 275) { doc.addPage(); y = M; }
      const wrapped = doc.splitTextToSize(`• ${term.text}`, CW);
      doc.text(wrapped, M, y);
      y += wrapped.length * 2.3 + 1;
    }
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  SIGNATURE (if signed)                                   ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.signature_data && quote.signed_by) {
    if (y > 240) { doc.addPage(); y = M; }

    y += 3;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(M, y, PW - M, y);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.dark);
    doc.text('Signature', M, y);
    y += 4;

    try {
      doc.addImage(quote.signature_data, 'PNG', M, y, 48, 18);
      y += 20;
    } catch { y += 2; }

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.gray);
    doc.text(`Signed by: ${ar(quote.signed_by)}`, M, y);
    if (quote.signed_at) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${fmtDate(quote.signed_at)}`, M, y + 5);
    }
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  FOOTER — on every page                                 ║
  // ╚══════════════════════════════════════════════════════════╝
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = PH - 16;  // ~281mm

    // Orange line
    doc.setDrawColor(...C.orange);
    doc.setLineWidth(0.8);
    doc.line(M, fy, PW - M, fy);

    // Row 1: Phone icon + number | 3 dots | Social handle
    // Phone circle
    doc.setFillColor(...C.orange);
    doc.circle(M + 2.5, fy + 4.5, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.white);
    doc.text('T', M + 2.5, fy + 5.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(FOOTER.phone, M + 7, fy + 5);

    // 3 orange dots (center)
    const cx = PW / 2 - 6;
    doc.setFillColor(...C.orange);
    doc.circle(cx, fy + 4.5, 1, 'F');
    doc.circle(cx + 4, fy + 4.5, 1, 'F');
    doc.circle(cx + 8, fy + 4.5, 1, 'F');

    // Social handle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(FOOTER.social, cx + 13, fy + 5);

    // Row 2: Web icon + websites
    doc.setFillColor(...C.orange);
    doc.circle(M + 2.5, fy + 9.5, 2, 'F');
    doc.setFontSize(5);
    doc.setTextColor(...C.white);
    doc.text('@', M + 2.5, fy + 10.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.orange);
    doc.text(FOOTER.web, M + 7, fy + 10);
  }

  if (options?.returnBlob) {
    return doc.output('blob');
  }
  doc.save(`quote-${quote.quote_number}.pdf`);
}

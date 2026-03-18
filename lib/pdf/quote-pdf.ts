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
  orangeHex: '#f97316',
  dark: [24, 24, 27] as [number, number, number],
  gray: [113, 113, 122] as [number, number, number],
  border: [210, 210, 210] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};
const PW = 210;          // A4 width
const M = 18;            // margin (generous like reference)
const CW = PW - M * 2;  // content width = 174mm

/* ── Helpers ── */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(s: string): string {
  try { const d = new Date(s); return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`; }
  catch { return s; }
}

/** Draw a dashed line matching the reference style */
function dash(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  for (let x = x1; x < x2; x += 2.2) {
    doc.line(x, y, Math.min(x + 1.3, x2), y);
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
export async function generateQuotePDF(quote: QuoteData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerArabicFont(doc);
  const ar = (t: string) => doc.processArabic(t);
  let y = 0;

  // ── Load logo ──
  let logo: string | null = null;
  try { logo = await loadImageAsBase64('/images/pyramediax-logo.png'); } catch { /* */ }
  if (!logo && quote.company_logo) { try { logo = await loadImageAsBase64(quote.company_logo); } catch { /* */ } }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  HEADER — Logo + Company Name | Client Info Grid        ║
  // ╚══════════════════════════════════════════════════════════╝
  y = 12;

  // Left: Logo (large, like reference ~40×40)
  const logoW = 38;
  const logoH = 38;
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, y, logoW, logoH); } catch { logo = null; }
  }

  // Company name under logo
  const nameY = logo ? y + logoH + 3 : y + 12;
  doc.setFont('Amiri', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.orange);
  doc.text(quote.company_name || 'PYRAMEDIA X', M, nameY);

  // Right: Client info — 3 columns matching reference exactly
  //   Col A (label 80→100): Client/Contact
  //   Col B (label 135→155): Email/Phone
  //   Col C: Address (far right, row 1 only)
  const A = 70;     // first label X
  const Av = 92;    // first value X
  const B = 135;    // second label X
  const Bv = 155;   // second value X
  const Cv = PW - M - 25; // address label
  const END_A = B - 4;
  const END_B = PW - M;

  doc.setFontSize(9);

  // -- Row 1: Client: | Email: | Address: --
  let ry = y + 4;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Client:', A, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_company || quote.client_name || '---').slice(0, 18), Av, ry);
  dash(doc, Av, ry + 1.5, END_A);

  doc.setFont('helvetica', 'bold');
  doc.text('Email:', B, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_email || '---').slice(0, 18), Bv, ry);
  dash(doc, Bv, ry + 1.5, END_B);

  doc.setFont('helvetica', 'bold');
  doc.text('Address:', Cv, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_address || '---').slice(0, 12), Cv + 20, ry);

  // -- Row 2: Contact: | Phone: --
  ry += 12;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...C.dark);
  doc.text('Contact:', A, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_name || '---').slice(0, 18), Av, ry);
  dash(doc, Av, ry + 1.5, END_A);

  doc.setFont('helvetica', 'bold');
  doc.text('Phone:', B, ry);
  doc.setFont('helvetica', 'normal');
  doc.text((quote.client_phone || '---').slice(0, 18), Bv, ry);
  dash(doc, Bv, ry + 1.5, END_B);

  y = Math.max(nameY + 5, ry + 10);

  // ── ORANGE SEPARATOR (thick, like reference) ──
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(1.5);
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

  y += 5.5;
  doc.setFont('helvetica', 'normal');
  for (let i = 0; i < 4; i++) {
    if (i === 3 && quote.project_name) {
      doc.setFont('Amiri', 'normal');
      doc.text(ar(quote.project_name).slice(0, 30), M + i * gw, y);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text(gValues[i], M + i * gw, y);
    }
  }

  y += 10;

  // ── Orange line (thin) ──
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.6);
  doc.line(M, y, PW - M, y);
  y += 10;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  ITEMS TABLE                                             ║
  // ╚══════════════════════════════════════════════════════════╝
  // Column positions
  const descEnd = M + CW - 60;
  const qtyMid = descEnd + 10;
  const rateMid = descEnd + 30;
  const amtR = PW - M - 2;

  // Header
  doc.setFillColor(...C.orange);
  doc.rect(M, y - 2, 3.5, 3.5, 'F');  // orange square

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('ITEM & DESCRIPTION', M + 7, y);
  doc.text('QTY', qtyMid, y, { align: 'center' });
  doc.text('RATE', rateMid, y, { align: 'center' });
  doc.text('AMOUNT', amtR, y, { align: 'right' });

  y += 4;
  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.6);
  doc.line(M, y, PW - M, y);
  y += 1;

  // Rows
  const rH = 12; // row height (generous like reference)
  const minR = Math.max(quote.items.length, 3);

  for (let i = 0; i < minR; i++) {
    if (y > 235) { doc.addPage(); y = M; }
    const item = quote.items[i];
    const top = y;

    // Cell outlines
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.rect(M, top, descEnd - M, rH);
    doc.rect(descEnd, top, 20, rH);
    doc.rect(descEnd + 20, top, 20, rH);
    doc.rect(descEnd + 40, top, PW - M - descEnd - 40, rH);

    if (item) {
      const cy = top + rH / 2 + 1.5;
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      // Description
      doc.setFont('Amiri', 'normal');
      const desc = item.description.length > 50 ? item.description.slice(0, 50) + '...' : item.description;
      doc.text(ar(desc), M + 3, cy);
      // Numbers
      doc.setFont('helvetica', 'normal');
      doc.text(String(item.quantity), qtyMid, cy, { align: 'center' });
      doc.text(fmtNum(item.rate), rateMid, cy, { align: 'center' });
      doc.text(fmtNum(item.amount), amtR, cy, { align: 'right' });
    }
    y += rH;
  }

  y += 14;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  TOTAL BOX                                               ║
  // ╚══════════════════════════════════════════════════════════╝
  const bw = 55;
  const bx = PW - M - bw;
  const hasTax = quote.tax_amount > 0;
  const bh = hasTax ? 24 : 14;

  doc.setDrawColor(...C.orange);
  doc.setLineWidth(0.7);
  doc.roundedRect(bx, y, bw, bh, 2, 2);

  if (hasTax) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.gray);
    doc.text('Subtotal:', bx + 4, y + 6);
    doc.text(fmtNum(quote.subtotal), bx + bw - 4, y + 6, { align: 'right' });
    doc.text(`VAT (${quote.tax_rate}%):`, bx + 4, y + 11);
    doc.text(fmtNum(quote.tax_amount), bx + bw - 4, y + 11, { align: 'right' });
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.15);
    doc.line(bx + 3, y + 14, bx + bw - 3, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.orange);
    doc.text(fmtNum(quote.total), bx + bw / 2, y + 21.5, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.orange);
    doc.text(fmtNum(quote.total), bx + bw / 2, y + 9.5, { align: 'center' });
  }

  y += bh + 10;

  // ╔══════════════════════════════════════════════════════════╗
  // ║  NOTES                                                   ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.notes) {
    if (y > 230) { doc.addPage(); y = M; }

    doc.setFont('Amiri', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text(ar('Notes:'), M, y);
    y += 5;

    doc.setFont('Amiri', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.gray);
    const noteLines = doc.splitTextToSize(ar(quote.notes), CW);
    doc.text(noteLines, M, y);
    y += noteLines.length * 4 + 6;
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  BANK ACCOUNT DETAILS                                    ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.bank_details?.bank) {
    if (y > 215) { doc.addPage(); y = M; }

    doc.setDrawColor(...C.dark);
    doc.setLineWidth(0.3);
    doc.line(M, y, PW - M, y);
    y += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.dark);
    doc.text('Bank account details', M, y);
    y += 5;

    // Table: 2 rows × 3 cols — label: value side by side (reference style)
    const bc = CW / 3;
    const bRows = [
      [
        { l: 'Name of the bank:', v: quote.bank_details.bank },
        { l: 'Account name:', v: quote.bank_details.account_name },
        { l: 'Account Class:', v: 'CURRENT ACCOUNT' },
      ],
      [
        { l: 'Account Type:', v: 'AED - Business Connect Current Acc' },
        { l: 'Account No:', v: quote.bank_details.account_no },
        { l: 'IBAN:', v: quote.bank_details.iban },
      ],
    ];

    for (const row of bRows) {
      for (let c = 0; c < 3; c++) {
        const cx = M + c * bc;
        // Cell border
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.2);
        doc.rect(cx, y, bc, 7);
        // Label (normal gray)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...C.gray);
        doc.text(row[c].l, cx + 2, y + 4.5);
        // Value (bold dark) — right after label
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.dark);
        const labelW = doc.getTextWidth(row[c].l);
        const maxValW = bc - labelW - 6;
        const val = row[c].v;
        // Truncate if needed
        let displayVal = val;
        while (doc.getTextWidth(displayVal) > maxValW && displayVal.length > 5) {
          displayVal = displayVal.slice(0, -1);
        }
        if (displayVal !== val) displayVal += '...';
        doc.text(displayVal, cx + labelW + 4, y + 4.5);
      }
      y += 7;
    }

    y += 5;
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  TERMS & CONDITIONS (3-column layout)                    ║
  // ╚══════════════════════════════════════════════════════════╝
  if (y > 190) { doc.addPage(); y = M; }

  doc.setDrawColor(...C.dark);
  doc.setLineWidth(0.4);
  doc.line(M, y, PW - M, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.dark);
  doc.text('TERMS & CONDITIONS', M, y);
  doc.setLineWidth(0.25);
  doc.line(M, y + 1.2, M + 42, y + 1.2);
  y += 5;

  const termKeys = Object.keys(TERMS);
  const tCols = [termKeys.slice(0, 4), termKeys.slice(4, 7), termKeys.slice(7)];
  const tw = (CW - 8) / 3;

  const tStartY = y;
  for (let ci = 0; ci < 3; ci++) {
    let ty = tStartY;
    const tx = M + ci * (tw + 4);

    for (const key of tCols[ci]) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.dark);
      doc.text(key, tx, ty);
      ty += 3;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...C.gray);
      for (const line of TERMS[key]) {
        const wrapped = doc.splitTextToSize(line, tw);
        doc.text(wrapped, tx, ty);
        ty += wrapped.length * 2.2 + 0.5;
      }
      ty += 2;
    }
    y = Math.max(y, ty);
  }

  // Custom terms from data
  if (quote.terms_conditions?.length > 0) {
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.gray);
    for (const term of quote.terms_conditions) {
      if (y > 275) { doc.addPage(); y = M; }
      const wrapped = doc.splitTextToSize(`• ${term.text}`, CW);
      doc.text(wrapped, M, y);
      y += wrapped.length * 2.5 + 1;
    }
  }

  // ╔══════════════════════════════════════════════════════════╗
  // ║  SIGNATURE                                               ║
  // ╚══════════════════════════════════════════════════════════╝
  if (quote.signature_data && quote.signed_by) {
    if (y > 240) { doc.addPage(); y = M; }

    y += 4;
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
  // ║  FOOTER (every page)                                     ║
  // ╚══════════════════════════════════════════════════════════╝
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const fy = 283;

    // Orange line
    doc.setDrawColor(...C.orange);
    doc.setLineWidth(0.7);
    doc.line(M, fy, PW - M, fy);

    // Row 1: Phone + dots + social
    doc.setFillColor(...C.orange);
    doc.circle(M + 2.5, fy + 4.5, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(...C.white);
    doc.text('T', M + 2.5, fy + 5.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text(FOOTER.phone, M + 7, fy + 5);

    const cx = PW / 2 - 8;
    doc.setFillColor(...C.orange);
    doc.circle(cx, fy + 4.5, 1.2, 'F');
    doc.circle(cx + 4, fy + 4.5, 1.2, 'F');
    doc.circle(cx + 8, fy + 4.5, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(FOOTER.social, cx + 14, fy + 5);

    // Row 2: Web
    doc.setFillColor(...C.orange);
    doc.circle(M + 2.5, fy + 9, 2, 'F');
    doc.setFontSize(5.5);
    doc.setTextColor(...C.white);
    doc.text('@', M + 2.5, fy + 9.7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.orange);
    doc.text(FOOTER.web, M + 7, fy + 9.5);
  }

  doc.save(`quote-${quote.quote_number}.pdf`);
}

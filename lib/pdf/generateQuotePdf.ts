import jsPDF from 'jspdf';

export interface ServiceItem {
  description: string;
  qty: number;
  rate: number;
}

export interface QuoteData {
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  contactPerson: string;
  clientPhone: string;
  quoteNumber: string;
  estimateDate: string;
  expiryDate: string;
  projectName: string;
  services: ServiceItem[];
  notes: string;
  currency: string;
  taxRate: number;
  bankDetails: {
    bank: string;
    account_name: string;
    account_no: string;
    iban: string;
  };
  companyName: string;
  signatureDataUrl: string | null;
  signedBy: string | null;
  signedAt: string | null;
}

const ORANGE = '#E87A2E';
const DARK = '#2D2D2D';
const GRAY = '#666666';
const LIGHT_GRAY = '#999999';
const BORDER = '#DDDDDD';
const BG_LIGHT = '#F8F8F8';

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function generateQuotePdf(data: QuoteData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw = 210; // page width
  const margin = 20;
  const cw = pw - 2 * margin; // content width
  let y = 20;

  // ── Company Header ──────────────────────────────────
  doc.setFontSize(18);
  doc.setTextColor(ORANGE);
  doc.text(data.companyName || 'PYRAMEDIA X', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(GRAY);
  doc.text('FOR AI SOLUTIONS', margin, y);
  y += 4;

  // Quote number top-right
  doc.setFontSize(10);
  doc.setTextColor(DARK);
  doc.text(`Quote: ${data.quoteNumber}`, pw - margin, 20, { align: 'right' });

  y += 6;

  // ── Orange separator ────────────────────────────────
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 8;

  // ── Client Info Grid ────────────────────────────────
  const col3 = cw / 3;

  doc.setFontSize(8);
  doc.setTextColor(LIGHT_GRAY);
  doc.text('Client', margin, y);
  doc.text('Email', margin + col3, y);
  doc.text('Address', margin + col3 * 2, y);
  y += 4;

  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text(data.clientName || '—', margin, y);
  doc.text(data.clientEmail || '—', margin + col3, y);
  doc.text(data.clientAddress || '—', margin + col3 * 2, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(LIGHT_GRAY);
  doc.text('Contact Person', margin, y);
  doc.text('Phone', margin + col3, y);
  y += 4;

  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text(data.contactPerson || '—', margin, y);
  doc.text(data.clientPhone || '—', margin + col3, y);
  y += 8;

  // ── Quote Details Grid ──────────────────────────────
  const col4 = cw / 4;

  doc.setFontSize(8);
  doc.setTextColor(LIGHT_GRAY);
  doc.text('Quote Number', margin, y);
  doc.text('Estimate Date', margin + col4, y);
  doc.text('Expiry Date', margin + col4 * 2, y);
  doc.text('Project Name', margin + col4 * 3, y);
  y += 4;

  doc.setFontSize(9);
  doc.setTextColor(DARK);
  doc.text(data.quoteNumber, margin, y);
  doc.text(data.estimateDate, margin + col4, y);
  doc.text(data.expiryDate, margin + col4 * 2, y);
  doc.text(data.projectName || '—', margin + col4 * 3, y);
  y += 8;

  // ── Orange separator ────────────────────────────────
  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // ── Services Table ──────────────────────────────────
  const colWidths = [10, cw - 70, 20, 20, 20]; // #, Description, Qty, Rate, Amount
  const colX = [margin];
  for (let i = 1; i < colWidths.length; i++) {
    colX.push(colX[i - 1] + colWidths[i - 1]);
  }

  // Table header
  doc.setFillColor(ORANGE);
  doc.rect(margin, y, cw, 7, 'F');
  doc.setFontSize(8);
  doc.setTextColor('#FFFFFF');
  const headers = ['#', 'Description', 'Qty', 'Rate', 'Amount'];
  headers.forEach((h, i) => {
    doc.text(h, colX[i] + 2, y + 5);
  });
  y += 7;

  // Table rows
  doc.setTextColor(DARK);
  let subtotal = 0;

  data.services.forEach((item, idx) => {
    const amount = item.qty * item.rate;
    subtotal += amount;

    if (idx % 2 === 1) {
      doc.setFillColor(BG_LIGHT);
      doc.rect(margin, y, cw, 7, 'F');
    }

    doc.setDrawColor(BORDER);
    doc.line(margin, y + 7, pw - margin, y + 7);

    doc.setFontSize(8);
    doc.setTextColor(DARK);
    doc.text(String(idx + 1), colX[0] + 2, y + 5);
    // Truncate long descriptions
    const desc =
      item.description.length > 55
        ? item.description.substring(0, 55) + '...'
        : item.description;
    doc.text(desc, colX[1] + 2, y + 5);
    doc.text(String(item.qty), colX[2] + 2, y + 5);
    doc.text(fmtNum(item.rate), colX[3] + 2, y + 5);
    doc.text(fmtNum(amount), colX[4] + 2, y + 5);

    y += 7;
  });

  y += 4;

  // ── Totals Box ──────────────────────────────────────
  const taxAmount = subtotal * (data.taxRate / 100);
  const total = subtotal + taxAmount;
  const totalsX = pw - margin - 60;

  doc.setDrawColor(ORANGE);
  doc.setLineWidth(0.3);
  doc.rect(totalsX, y, 60, 24);

  doc.setFontSize(8);
  doc.setTextColor(GRAY);
  doc.text('Subtotal', totalsX + 3, y + 5);
  doc.text(fmtNum(subtotal), totalsX + 57, y + 5, { align: 'right' });

  doc.text(`VAT (${data.taxRate}%)`, totalsX + 3, y + 12);
  doc.text(fmtNum(taxAmount), totalsX + 57, y + 12, { align: 'right' });

  doc.setDrawColor(ORANGE);
  doc.line(totalsX, y + 15, totalsX + 60, y + 15);

  doc.setFontSize(10);
  doc.setTextColor(DARK);
  doc.text('Total (AED)', totalsX + 3, y + 21);
  doc.text(fmtNum(total), totalsX + 57, y + 21, { align: 'right' });

  y += 30;

  // ── Notes ───────────────────────────────────────────
  if (data.notes) {
    doc.setFontSize(8);
    doc.setTextColor(LIGHT_GRAY);
    doc.text('Notes:', margin, y);
    y += 4;
    doc.setTextColor(GRAY);
    const lines = doc.splitTextToSize(data.notes, cw);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 4;
  }

  // ── Signature ───────────────────────────────────────
  if (data.signatureDataUrl) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(LIGHT_GRAY);
    doc.text('Signature:', margin, y);
    y += 2;
    try {
      doc.addImage(data.signatureDataUrl, 'PNG', margin, y, 50, 25);
    } catch {
      // Signature image failed to load
    }
    y += 27;
    if (data.signedBy) {
      doc.setTextColor(GRAY);
      doc.text(`Signed by: ${data.signedBy}`, margin, y);
      if (data.signedAt) {
        doc.text(`Date: ${data.signedAt}`, margin + 50, y);
      }
      y += 6;
    }
  }

  // ── Bank Details ────────────────────────────────────
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  y = Math.max(y, 220);

  doc.setFillColor(BG_LIGHT);
  doc.rect(margin, y, cw, 22, 'F');

  doc.setFontSize(8);
  doc.setTextColor(LIGHT_GRAY);
  doc.text('Bank Details', margin + 3, y + 5);

  doc.setTextColor(GRAY);
  doc.text(`Bank: ${data.bankDetails.bank}`, margin + 3, y + 10);
  doc.text(`Account Name: ${data.bankDetails.account_name}`, margin + 3, y + 14);
  doc.text(`Account No: ${data.bankDetails.account_no}`, margin + 3, y + 18);
  doc.text(`IBAN: ${data.bankDetails.iban}`, margin + cw / 2, y + 18);

  y += 26;

  // ── Terms & Conditions ──────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(LIGHT_GRAY);
  doc.text('Terms & Conditions', margin, y);
  y += 3.5;

  const terms = [
    'Quotation valid for 30 days from the date of issue.',
    '50% advance payment required to commence work.',
    'Balance payment due upon project completion.',
  ];

  doc.setTextColor(GRAY);
  terms.forEach((t, i) => {
    doc.text(`${i + 1}. ${t}`, margin + (i * col3), y);
  });

  y += 6;

  // ── Footer ──────────────────────────────────────────
  const footerY = 285;
  doc.setFillColor(DARK);
  doc.rect(0, footerY, pw, 12, 'F');

  doc.setFontSize(7);
  doc.setTextColor('#FFFFFF');
  doc.text(
    `${data.companyName || 'PYRAMEDIA X'} — FOR AI SOLUTIONS`,
    pw / 2,
    footerY + 5,
    { align: 'center' }
  );
  doc.text(
    'Abu Dhabi, United Arab Emirates',
    pw / 2,
    footerY + 9,
    { align: 'center' }
  );

  // Save
  doc.save(`${data.quoteNumber}.pdf`);
}

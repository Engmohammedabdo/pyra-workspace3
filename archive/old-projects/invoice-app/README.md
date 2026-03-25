# Pyramedia Invoice Generator

A single-page HTML web app for generating professional quotations and invoices with Pyramedia branding.

## Features

- **Live Preview** — Invoice updates in real-time as you type
- **Print** — Prints only the invoice (form controls are hidden)
- **Download PDF** — Generates a PDF via html2pdf.js
- **Signature Pad** — Touch & mouse support for client signatures
- **Save/Load Draft** — Persists data to localStorage
- **Auto-increment Invoice Numbers** — Stored in localStorage, editable
- **Responsive** — Works on desktop and mobile
- **Zero build tools** — Just open the HTML file in any browser

## Usage

1. Open `index.html` in any modern browser
2. Fill in client info, invoice details, and line items
3. Have the client sign in the signature area
4. Click **Print** or **Download PDF**

## Tech Stack

- Vanilla HTML/CSS/JS (single file)
- [Signature Pad 4.1.7](https://github.com/szimek/signature_pad) (CDN)
- [html2pdf.js 0.10.1](https://github.com/eKoopmans/html2pdf.js) (CDN)

## Branding

- Primary: `#F97316` (Orange)
- Dark: `#1a1a2e`
- Footer includes Pyramedia contact info and ADIB bank details

## Data Storage

All data stays in your browser's `localStorage`:
- `pyra_inv_draft` — saved form data
- `pyra_inv_last` — last invoice number used

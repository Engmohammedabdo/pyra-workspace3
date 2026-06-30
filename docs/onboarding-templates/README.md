# Onboarding Document Templates — verbatim source reference

Source content for the 3 generated onboarding documents (Phase 1).
Implementers MUST use the verbatim Arabic text from these files.

- `source/offer-letter-generator.html` — the user's working offer-letter
  generator (all clauses + the is_sales toggle + comp table + extra-note field).
  Port its content/logic into `lib/pdf/offer-letter-pdf.ts`.
- `nda-content-ar.md` — verbatim 15-article NDA → `lib/pdf/nda-pdf.ts`.
  (`source/pyramedia-nda-ar.docx` is the original.)
- `asset-handover-content-ar.md` — verbatim asset custody form →
  `lib/pdf/asset-handover-pdf.ts`.
- `source/Pyramedia_Salary_Receipt_A5.html` — salary receipt (OUT of onboarding
  scope; for the future payroll-surface receipt generator).

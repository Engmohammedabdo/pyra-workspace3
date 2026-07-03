# Onboarding for Existing Active Employees + PDF Currency Fix

**Goal:** Let HR generate onboarding documents (offer letter / NDA / asset
handover — selectable) for employees who ALREADY exist as active users,
prefilled from their `pyra_users` record, WITHOUT creating an account or
touching their password. Also fix the hardcoded AED/درهم in the PDFs so EGP
employees (wael.hany, abdelrahman.morshedy) get correct-currency documents.

**User decisions (locked):**
- Documents are SELECTABLE (checkboxes, default all 3). Missing ones can be
  generated later via the existing regenerate endpoint.
- NO task checklist for existing employees — the record is created
  `completed` (docs are the deliverable; "set up email"-style tasks are
  meaningless for someone already working).

## API — `app/api/hr/onboarding/route.ts` POST
- Accept `existing_employee?: boolean` + `documents?: string[]` (subset of
  `['offer_letter','nda','asset_handover']`; default all; reject empty) +
  `currency?: string` (validated against SALARY_CURRENCIES; default 'AED').
- When `existing_employee`:
  - `password` NOT required (skip its validation); username must belong to an
    EXISTING ACTIVE user (else 404/409) with `onboarding_id IS NULL`
    (else 409 "لدى الموظف سجل onboarding بالفعل").
  - SKIP createEmployeeUser/reactivateEmployeeUser entirely (account untouched).
  - Insert `pyra_onboarding` with `status='completed'` + `completed_at=now()`;
    link `pyra_users.onboarding_id`; NO task seeding; generate only the
    selected docs; activity log with `source:'onboarding_existing_employee'`.
- New-hire path unchanged (still always generates all 3 + checklist) EXCEPT it
  now also passes `salary_currency: currency` into createEmployeeUser (was
  silently defaulting to AED) and stores `currency` in offer_data.

## Currency threading
- `OfferData.currency?: string` (types/database.ts).
- `lib/pdf/offer-letter-pdf.ts`: `Monthly (AED)`/`Annual (AED)` headers +
  sales-target clause use the currency code + Arabic label.
- `lib/pdf/asset-handover-pdf.ts`: `القيمة (درهم)` column header currency-aware.
- Arabic labels: AED=درهم إماراتي, EGP=جنيه مصري, USD=دولار أمريكي, SAR=ريال سعودي
  (shared map in lib/constants — reuse if one exists).
- Regenerate route needs no change (reads offer_data; currency persists).

## Wizard — mode toggle "موظف جديد" | "موظف حالي"
- Existing mode: active-user picker (employees/sales agents; users with
  onboarding_id shown disabled "لديه سجل"), prefill from the user row
  (nameAr/En←display_name, titleAr←job_title, basic←salary, currency←
  salary_currency, idNumber←national_id, phone, startDate←hire_date,
  employment_type, work_location, reportsTo←manager_username, isSales←role,
  commissionRate), hide username/password fields + skip their validation.
- Documents checkboxes (default all 3) in the review step (existing mode only).
- Compensation step: currency select (default AED / prefilled) for BOTH modes.
- Guard the list page ProgressBar against 0 tasks (0/0 division).

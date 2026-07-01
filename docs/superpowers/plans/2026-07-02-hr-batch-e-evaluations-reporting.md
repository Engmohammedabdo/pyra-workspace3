# HR Batch E — Evaluations + Reporting (Implementation Plan)

**Goal:** Close the evaluations workflow gaps (KPI progress, bonus action, trend)
and surface the two reporting figures that were computed-but-hidden or missing.

**Verification:** `pnpm run check` + `pnpm build`; adversarial review; ship.

## E1 — KPI progress update
- NEW `app/api/dashboard/kpi/[id]/route.ts` PATCH (`evaluations.manage`) — update
  `actual_value` (+ optional title/target/unit/status). Was insert-0-only.
- `KpiProgressEditor` component + wired into KpisTab (gated on manage).

## E2 — Bonus recommendation button
- The `recommend_bonus` action already existed (tiered 5/10/15% → pending payment).
  Wired a "التوصية بمكافأة" button into the evaluation detail (manage + rating≥3.5 +
  submitted/acknowledged). Fixed its hardcoded `AED` → employee `salary_currency`.

## E3 — Cross-period performance trend
- NEW `PerformanceTrend` component + 4th tab — employee rating across periods (line
  chart, average, below-3.0 flag).

## E4 — Turnover / attrition
- Migration 029: `pyra_users.deactivated_at` (stamped on active→inactive/suspended
  in the users PATCH; cleared on reactivation + re-hire).
- Overview route returns `headcount.{inactive, departed_30d/90d/365d}`; surfaced as
  a 6th KPI card "المغادرون (90 يوم)".

## E5 — Leave liability (monetary)
- Overview liability now monetary + currency-grouped: remaining PAID-leave days ×
  (salary / PAYROLL_WORKING_DAYS_PER_MONTH), bucketed by `salary_currency`.
  `leave.liability_by_currency` + new `LeaveLiabilityCard` widget.

## Notes
- `paid_liability_days` is now paid-types-only (was summing all types) — correct.
- `deactivated_at` is NULL for pre-existing inactive users (departure date unknown)
  — they're excluded from departed-in-window counts, which is honest.

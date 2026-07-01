# HR Batch B — Lifecycle + Data Integrity (Implementation Plan)

**Goal:** Stop employee-lifecycle actions from silently corrupting data or
stranding approvals: guard hard-delete, handle manager deactivation, route
approvals to an active recipient, allow re-hire, and give employees self-service
over their own contact + bank details.

**Verification:** `pnpm run check` + `pnpm build`; adversarial review; ship.

---

## B1 — DELETE guard + integrity (`app/api/users/[username]/route.ts` DELETE)

Per locked decision: **block hard-delete when the employee has records; suggest deactivate.**

- After the "user exists" check, BEFORE any cleanup, count blocking records (service role):
  - `pyra_payroll_items` (`username`), `pyra_employee_payments` (`username`),
    `pyra_employee_documents` (`employee_username`), `pyra_onboarding` (`employee_username`).
  - If the sum > 0 → `apiError('لا يمكن حذف الموظف لوجود سجلات مالية/وثائق/تعيين مرتبطة. استخدم "تعطيل" الحساب بدلاً من الحذف للحفاظ على السجلات.', 409)`.
- If deletable (no blocking records):
  1. Capture direct reports via `getDirectReports(serviceClient, username)`.
  2. Null their manager link: `UPDATE pyra_users SET manager_username = null WHERE manager_username = username`.
  3. Proceed with existing cleanup + user + auth delete.
  4. If there were reports, `notifyMany(serviceClient, adminUsernames, ...)` — "تم فك ارتباط N موظف بعد حذف مديرهم، أعِد تعيينهم".

## B2 — Manager deactivation alert (`...[username]/route.ts` PATCH)

- When `body.status` is `inactive` or `suspended`: after the update succeeds, fetch
  direct reports; if any, `notifyMany(admins, ...)` — "تم تعطيل X وله N موظف تابع، أعِد تعيين مديرهم".
- Do NOT null on deactivate (relationship preserved for reactivation; B3 keeps
  approvals flowing to admins meanwhile).

## B3 — `notifyApprovers` helper + admin fallback

- NEW `lib/notifications/approvers.ts`:
  `notifyApprovers(supabase, employeeUsername, input: Omit<NotifyInput,'to'>)`:
  get manager via `getManagerOf`; if that manager's `status==='active'` → `notify` them;
  else `notifyMany` all active admins. Guarantees SOMEONE is always notified.
- Replace the manual `getManagerOf`+`if(managerUsername) notify` blocks with `notifyApprovers`
  in: `app/api/leave/route.ts` POST, `app/api/finance/expenses/route.ts` POST,
  `app/api/dashboard/timesheet-periods/[id]/route.ts` submit.

## B4 — Re-hire / reactivation (`app/api/hr/onboarding/route.ts` + `lib/hr/create-employee.ts`)

- NEW `reactivateEmployeeUser(supabase, input)` in `create-employee.ts`: UPDATE the
  existing `pyra_users` row (status='active' + employment fields, same mapping as
  `createEmployeeUser`), reset the Auth password via `resolveAuthUserId` +
  `auth.admin.updateUserById(id, { password })`. Returns `{ ok, user } | { ok:false, error, status }`.
- Onboarding POST: before create, look up existing user by username.
  - exists & `status==='active'` → 409 "اسم المستخدم مستخدم بالفعل لموظف نشط".
  - exists & inactive/suspended → `reactivateEmployeeUser(...)`, then continue onboarding (docs + row).
  - not exists → `createEmployeeUser(...)` as today.

## B5 — Employee self-service: bank details (done inline, not delegated)

- `app/api/profile/route.ts` PATCH: add `'bank_details'` to `allowed`; validate
  object|null (mirror admin route); add `logActivity(USER_UPDATE, source:'self_edit')`.
- `app/dashboard/profile/profile-client.tsx`: add a "البيانات البنكية" Card in the
  info tab (bank/iban/account_name/account_no), initialized from `profile.bank_details`,
  saved via the profile PATCH. (Phone is already editable — no change.)

## Invariants
- `notifyMany`/`notify` are fire-and-forget (never throw); admins fetched as
  `role='admin' AND status='active'`.
- No raw `pyra_notifications` inserts. `logActivity` for audit.
- Deactivate preserves the manager link; only hard-delete nulls it.

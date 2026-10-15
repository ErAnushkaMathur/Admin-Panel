# Sweet Shop Staff Panel — Build Spec (for Claude Code)

> Sections marked **Changed:** differ from the original plan because of what was actually built. Sections marked **BUILT** are implemented and tested.

Stack: React + Vite + Tailwind + React Router + Axios | Node + Express | MongoDB + Mongoose | JWT + bcrypt.
Reference: the 2 dashboard screenshots (dark brown sidebar, cream background, coral active nav, rounded cards).

---

## 0. Golden rules (break these = PR rejected)

1. **One source of truth.** Every number on the dashboard is computed by the backend from `attendance`, `leaves`, `payroll` collections. Frontend never calculates totals. Never hardcode.
2. **Multi-tenant from day 1.** Every collection has `businessId`. Every query filters by `req.user.businessId`. No exceptions. Add a Mongoose plugin/middleware so forgetting it is impossible.
3. **Server time only for punches.** Never trust the phone's clock. Store UTC, display in `Asia/Kolkata`.
4. **Money in paise (integers).** No floats. Format to ₹ only in UI.
5. **Snapshot payroll.** Once a month is finalized, store the calculated numbers. Later changes to salary settings must not rewrite old payslips.
6. **Soft delete.** Employees are `isActive:false`, never deleted (payroll history needs them).
7. **Validate everything** (zod/joi) on the backend. Frontend validation is only for UX.
8. **One feature at a time:** model → API → Postman test → page → connect → test → commit.
9. **Audit every sensitive change** (salary, attendance edit, leave approval, payroll finalize, PIN reset, deactivation): write an AuditLog entry and register the action in `AUDIT_ACTIONS` (`server/src/services/auditLog.service.js`).
10. **`deriveStatus()` is the single source of truth** for attendance status. Payroll, dashboard and analytics use it, never their own calculation.
11. **IST calendar days** for all date logic (a 00:30 IST change counts as that day, not the UTC day).
12. **Run `npm test` in `server/`** before finishing any task; all tests must pass.

---

## 1. Roles

| Role | Can do |
|---|---|
| Owner | Everything, incl. payroll finalize, settings, billing |
| Manager (later) | Attendance, leaves, view employees. No salary numbers |
| Employee | Only the public punch page. No login in Phase 1 |

---

## 2. Data models (minimum)

**Business**: name, ownerId, timezone, plan, createdAt. **Changed:** also stores the half-day threshold (default 4 hours).
**User** (owner/manager): name, email, passwordHash, role, businessId
**Department**: businessId, name (Kitchen, Counter, Cleaning, Delivery…), color, icon
**Shift**: businessId, name (Morning/Evening/Full Day), startTime, endTime, graceMinutes, crossesMidnight
**Employee**: businessId, employeeCode (unique per business), name, phone, departmentId, roleTitle (Chef, Helper…), shiftId, joinDate, isActive, pinHash, salary { type: monthly|daily|hourly, amountPaise, overtimeMultiplier, weeklyOff[] }
**Attendance**: businessId, employeeId, date (YYYY-MM-DD, IST), punchIn, punchOut, source (qr|link|manual), status, lateMinutes, workedMinutes, overtimeMinutes, flags[] (missing_checkout, manual_edit, device_mismatch), editedBy, editReason. **Changed:** also stores `ip`, `userAgent`, and optional future fields `method`, `gps`, `selfieUrl`, `faceConfidence`, `reviewStatus` (null for now)
**Leave**: businessId, employeeId, fromDate, toDate, type (paid|unpaid|sick), status (pending|approved|rejected), reason
**Payroll**: businessId, employeeId, month (YYYY-MM), snapshot { workingDays, presentDays, absentDays, paidLeaveDays, lateCount, overtimeMinutes, basePaise, overtimePaise, deductionsPaise, bonusPaise, advancePaise, netPaise }, status (draft|finalized|paid), paidDate
**AuditLog**: businessId, actorId, action, entity, before, after, at. **Changed:** also stores the reason for attendance edits; indexed for newest-first listing.

Indexes: Attendance `{businessId, employeeId, date}` unique. Employee `{businessId, employeeCode}` unique.

---

## 3. Phases (do in this order)

| Phase | Deliverable |
|---|---|
| 1 | Auth + Business + layout shell (sidebar/topbar) |
| 2 | Departments + Shifts + Employees CRUD |
| 3 | Punch page (QR/link + PIN) + attendance records |
| 4 | Attendance page (daily/monthly view, manual correction) |
| 5 | Leave management |
| 6 | Payroll calc + payslip + finalize |
| 7 | Dashboard (real data) |
| 8 | Staff Analytics + basic AI insights |

Do not build the dashboard first. It has nothing to show until 2–6 exist.

---

## 4. Page specs

### 4.1 Login / Register — `/login`, `/register`
- Register creates Business + Owner user. Login returns JWT (httpOnly cookie preferred).
- API: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- Done when: wrong password shows error, protected routes redirect to login, token expiry handled.

### 4.2 App Shell (layout)
- Sidebar: Dashboard, Employees, Departments, Attendance, Shifts, Payroll, Leave Management, Staff Analytics, Audit Log (owner only, between Staff Analytics and Settings), Settings. Collapsible (hamburger). **Changed:** Audit Log was added as its own sidebar item; managers do not see it. Business name at top.
- Topbar: search, notification bell (badge = pending leaves + missing checkouts), user menu (name + role).
- Done when: active route highlighted, mobile responsive (sidebar becomes drawer).

### 4.3 Departments — `/departments`
- List cards: name, staff count, today's present/total. Add/edit/archive department.
- API: `GET/POST/PATCH /departments`
- Rule: cannot archive a department that has active employees (block with message).

### 4.4 Shifts — `/shifts`
- Table: name, start, end, grace minutes, employees assigned. Add/edit.
- Rule: if end < start, mark `crossesMidnight`. Attendance for that shift belongs to the date the shift **started**.

### 4.5 Employees — `/employees`, `/employees/:id`
- List: search, filter by department/status, table (name, code, dept, role, shift, phone, status).
- Add/Edit form: name, phone, department, role title, shift, join date, salary type + amount, overtime multiplier, weekly off days.
- PIN: system generates a 4-digit PIN on create, shows **once**, owner can reset. Store only the hash.
- Profile page: details, this month's attendance calendar, salary summary, leave history.
- API: `GET/POST/PATCH /employees`, `POST /employees/:id/reset-pin`
- Rules: phone unique per business; deactivate instead of delete; salary edit is audit-logged.

### 4.6 Punch page (public, mobile-first) — `/punch/:businessToken`
This is the most important page. Employees use it on phones.
- Flow: scan QR / open link → enter Employee Code + PIN → server decides IN or OUT → big confirmation screen ("Ramesh, punched IN at 08:12 AM").
- Server logic: no open record today → punch in. Open record → punch out. Already closed → show "already done".
- Anti-abuse: rate limit (5 wrong PINs → 15 min lock per employee), log IP + user agent, optional geofence later.
- The QR encodes the business punch URL. Owner can regenerate the token from Settings (invalidates old QR).
- API: `POST /punch` (public, rate-limited) body `{businessToken, employeeCode, pin}`
- Done when: works on a low-end Android browser, no login needed, wrong PIN never reveals whether the code exists.

**Changed (BUILT):** every punch also stores `ip` and `userAgent`. If they differ from the employee's last 3 punches, the record gets the flag `device_mismatch`. The punch is not blocked; the owner sees an amber "New device" badge. The Attendance model also has optional fields kept for future selfie/GPS/face-match: `method`, `gps`, `selfieUrl`, `faceConfidence`, `reviewStatus` (all null for now).

### 4.7 Attendance — `/attendance` (BUILT)
Purpose: track who worked, when, and with what status. Data comes from the public punch page (QR/code/PIN) and from manual corrections by owner or manager. Page is for owner and manager.

Status rules (`deriveStatus()`, one pure function used everywhere: Attendance page, payroll, dashboard, analytics):
- **Present:** punched in by shift start plus grace minutes, or the shift is still in progress.
- **Late:** arrived after grace; late minutes are counted from shift start (works for night shifts too).
- **Half day:** worked less than the threshold (default 4 hours, stored on the business). Exactly at the threshold is not a half day. Half day overrides Late.
- **Leave / Weekly off:** leave beats weekly off, but if the employee actually punched, it counts as work. **Changed:** leave is not connected to `deriveStatus()` until Phase 5 (Leave Management).
- **Absent vs Not yet in:** a night shift isn't absent until 06:00 next day; future dates are never absent.
- **Manual status** overrides everything.

Tabs:
- **Today:** filters by date, department and status, clickable summary chips, refreshes every 60 seconds, Edit or Add per row.
- **Monthly:** employee x day grid (P, L, H, A, LV, WO), colour-coded, with server-calculated totals. Click a day to edit.
- **Exceptions:** missing punch-outs, manual edits and new-device punches, with a Fix button.

Manual edits: a reason of at least 5 characters is required. Only changed fields are sent. Every edit is saved with an audit entry (before, after, reason, who) and the `manual_edit` flag.

Flags:
- `device_mismatch`: punch came from an IP/user-agent not seen in the employee's last 3 punches (see 4.6).
- `missing_checkout`: a nightly job at 02:00 IST (and at startup) flags records open for more than 16 hours. It never fills in hours.

API: `GET /api/attendance`, `GET /api/attendance/monthly`, `GET /api/attendance/exceptions`, `PATCH /api/attendance/:id`, `POST /api/attendance/manual`.

### 4.8 Leave Management — `/leaves`
- Table of requests with Approve/Reject. Owner can add leave on behalf of staff (Phase 1 has no employee login).
- Paid leave = counted as paid day. Unpaid = salary deduction.
- Rule: overlapping leaves for the same employee are rejected.
- Approve, reject and owner-added leave write an AuditLog entry.
- Approved leave must be connected to `deriveStatus()` so those dates show as On Leave (leave beats weekly off; an actual punch counts as work).

### 4.9 Payroll — `/payroll`
- Month picker → table per employee: base, overtime, deductions, bonus, advance, net, status. Buttons: Recalculate, Finalize month, Mark paid, Download payslip PDF.
- Calculation (put in one pure, tested function `calculatePayroll(employee, attendance[], leaves[], settings)`):
  - **Monthly**: `perDay = monthly / workingDaysInMonth` (setting: 26 fixed OR actual days minus weekly offs). `base = perDay × (presentDays + paidLeaveDays + weeklyOffDays if policy pays them)`. Absent and unpaid leave are deducted.
  - **Daily**: `perDay × presentDays` (half day = 0.5).
  - **Hourly**: `rate × workedHours`.
  - **Overtime**: minutes beyond shift hours × `hourlyRate × overtimeMultiplier`. Only if setting enabled.
  - **Late deduction** (optional setting): e.g. 3 lates = 1 half day cut.
  - **Advance**: entered manually, subtracted from net.
  - `net = base + overtime + bonus − deductions − advance`. Must not go below 0.
- Finalize locks the snapshot. Reopening requires Owner + audit log.
- API: `GET /payroll?month=`, `POST /payroll/calculate`, `POST /payroll/finalize`, `PATCH /payroll/:id/paid`, `GET /payroll/:id/payslip`
- Done when: 10 hand-calculated test cases pass (write them BEFORE the code).

### 4.10 Dashboard — `/dashboard` (last, after data exists)
Match the screenshots. Every widget = one endpoint `GET /dashboard/summary`.
- KPI cards: Total Active Staff, Present Today (x/y + %), On Leave (+ pending requests), Est. Monthly Payment.
- Also add: Late Arrivals, Absent Today.
- Attendance overview donut (Monthly/Weekly/Yearly toggle): Present, Late, Absent, On Leave, Half Day.
- Salary overview: basic, overtime, deductions, total (must equal basic + overtime − deductions).
- Department attendance: present/total per department with progress bar.
- Staff attendance table: name, role, status pill, check-in, shift. "View All" → Attendance page.
- Upcoming salary payments: from Payroll, status Pending/Paid.
- Upsell banner: only shown if plan = free.
- Rules: loading skeletons, empty states, auto-refresh every 60s.

### 4.11 Staff Analytics — `/analytics`
- Attendance trend (line), late-arrival ranking, overtime by department, absentee patterns (e.g. Mondays), payroll cost trend.
- API: `GET /analytics/attendance?range=`, `/analytics/payroll?range=`

### 4.12 Settings — `/settings`
- Business profile, timezone, working-days policy, half-day threshold, grace minutes default, overtime on/off, late-deduction rule, punch QR (view/download/regenerate), change password.

**Changed:** the half-day threshold (default 4 hours) is already stored on the business but has no Settings screen yet. The Settings page must read and write that existing field.

### 4.13 AI Insights (Phase 8, after real data exists)
- Not a chatbot. Backend computes facts first (e.g. "Amit was absent 4 of the last 6 Mondays", "Kitchen overtime up 32% vs last month"), then LLM only phrases them into short, actionable cards. Never let the LLM do the maths.
- Free tier: 3 basic rule-based insights. Premium: LLM-written summaries + forecast.

### 4.14 Audit Log — `/audit-log` (BUILT, owner only)
Purpose: an accountability trail for sensitive changes: who changed what, before and after, and when.

- **Logged now:** salary changes (only when the salary actually changed); attendance manual edits and manual additions (with the mandatory reason). Each entry is saved together with the change, both or neither.
- **Not logged yet:** PIN resets and employee deactivation. Also to check: department archive, shift edit, business settings changes.
- **Rule:** every new audited action must be registered in `AUDIT_ACTIONS` (`server/src/services/auditLog.service.js`) so it gets a label and appears in the type filter. Unregistered actions still show, under their raw name.
- **API:** `GET /api/audit-logs?from=&to=&employeeId=&type=&page=` (owner only; managers get 403). Paging at 50 per page. Money stays in paise on the server and is formatted as Rs in the UI.
- **Page:** date range (IST calendar days, inclusive), employee and type filters kept in the URL. Each entry shows type, who and their role, when (IST), reason, and a before -> after table of only the fields that changed. Loading skeleton, empty and error states. Managers opening the URL see "Owners only".
- **Employee filter:** attendance entries point at an attendance record, so the server maps them back to the employee. The dropdown lists up to 100 employees; a shop with more needs a search box.

---

## 5. Mockup bugs — fix in design, not code

The screenshots have numbers that contradict each other. Real data must never look like this:
1. Donut: Present 10 + Late 2 + Absent 2 + On Leave 1 = 15, but total staff = 12. Also "Present 10 = 67%" while the KPI card says 83%. Late staff **are present**, so define: Present (on time) + Late + Absent + On Leave + Half Day = total.
2. Department attendance adds up to 19/23, not 10/12.
3. Salary: 1,32,000 + 8,500 − 6,500 = 1,34,000, not 1,48,000.
4. Priya Verma has an Evening shift but checked in at 08:05 AM.
5. "Est. Monthly Payment" and "Total Staff Salary" show the same figure — decide whether one is estimate-so-far and the other the full-month projection.

---

## 6. Claude Code workflow for the junior dev

- `CLAUDE.md` in the repo root holds a short copy of the golden rules (section 0) and conventions. This file lives at `docs/SPEC.md` and is read per task. Keep the two in sync when a rule changes.
- One prompt per task, e.g. *"Build the Employee model and CRUD routes with businessId scoping and zod validation. Do not touch the frontend. Add a Postman collection."*
- Ask for tests on: `deriveStatus()`, `calculatePayroll()`, tenant isolation.
- Commit after every working feature. Never let Claude Code refactor unrelated files.

## 7. Security checklist

- bcrypt for passwords and PINs; helmet; CORS locked to your domain; rate limit on `/punch` and `/auth`.
- Tenant-isolation test: create two businesses, confirm A can never read B by ID guessing.
- Salary fields hidden from non-owner roles at the API level, not just the UI.
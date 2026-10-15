# Project: Sweet Shop Staff Panel

Staff attendance + auto payroll SaaS for small sweet shops.
Full page-by-page spec: `docs/SPEC.md` (read the relevant section before building any feature).

## Stack
- client/: React + Vite + Tailwind + React Router + Axios
- server/: Node + Express + MongoDB (Mongoose) + JWT + bcrypt + zod for validation

## Folder conventions
- server/src/{models,routes,controllers,middleware,services,utils,jobs}
- client/src/{pages,components,api,hooks,layouts,utils}
- Business logic (deriveStatus, calculatePayroll) lives in server/src/services as pure functions with tests.

## Golden rules (never break)
1. Every number on the dashboard is computed by the backend. Frontend never calculates totals.
2. Multi-tenant: every collection has `businessId`; every query filters by `req.user.businessId`.
3. Punch times use SERVER time only. Store UTC, display in Asia/Kolkata.
4. Money is stored in paise (integers). Format to Rs only in the UI.
5. Payroll is snapshotted when a month is finalized; never rewrite old payslips.
6. Soft delete only (isActive:false). No hard deletes for employees.
7. Validate all input on the backend with zod. Never return passwordHash or pinHash.
8. Manual attendance edits require a reason and write an AuditLog entry.
9. Every sensitive change (salary, attendance edit, leave approval, payroll finalize, PIN reset, deactivation) must write an AuditLog entry and be registered in AUDIT_ACTIONS in server/src/services/auditLog.service.js.
10. deriveStatus() is the single source of truth for attendance status. Payroll, dashboard and analytics must use it, never their own calculation.
11. All date logic uses IST calendar days (a 00:30 IST change counts as that day, not the UTC day).
12. Run `npm test` in server/ before finishing any task; all tests must pass.

## UI style
Dark brown sidebar, warm cream background, coral/pink active nav, rounded cards, soft shadows.
Every page needs loading skeleton, empty state, and error state. Mobile responsive.

## Working style
- Do only the task asked. Do not refactor or touch unrelated files.
- Order per feature: model -> routes -> tests/Postman -> frontend page -> connect -> test.
- Before writing code for a task, state in 3-5 lines what you will create. After finishing, list the files changed and how to test.
- Ask me if a requirement is ambiguous instead of guessing.
- Never hardcode secrets; use .env and keep .env.example updated.
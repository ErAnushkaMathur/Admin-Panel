export const PAYROLL_STATUSES = {
  draft: { label: 'Draft', pill: 'bg-background-deep text-syrup-soft' },
  finalized: { label: 'Finalized', pill: 'bg-leave-tint text-leave-ink' },
  paid: { label: 'Paid', pill: 'bg-present-tint text-present-ink' },
}

export const SALARY_TYPES = { monthly: 'Monthly', daily: 'Daily', hourly: 'Hourly' }

// Rate as the owner set it: "₹26,000 / month"
export const RATE_SUFFIX = { monthly: '/ month', daily: '/ day', hourly: '/ hour' }

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// "2026-09" -> "September 2026"
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

// Day counts read out from the server snapshot ("0.5" never appears: half days are their own count)
export function dayCounts(s) {
  return [
    ['Present', s.presentDays],
    ['Late', s.lateDays],
    ['Half day', s.halfDays],
    ['Absent', s.absentDays],
    ['Paid leave', s.paidLeaveDays],
    ['Unpaid leave', s.unpaidLeaveDays],
    ['Weekly off', s.weeklyOffDays],
  ]
}

// Deduction lines for the payslip, only the non-zero ones
export function deductionLines(s) {
  const b = s.deductionBreakdown ?? {}
  return [
    [`Absent (${s.absentDays} ${s.absentDays === 1 ? 'day' : 'days'})`, b.absentPaise],
    [`Unpaid leave (${s.unpaidLeaveDays} ${s.unpaidLeaveDays === 1 ? 'day' : 'days'})`, b.unpaidLeavePaise],
    [`Half days (${s.halfDays})`, b.halfDayPaise],
    [`Late arrivals (${s.lateCuts} × half day for ${s.lateCount} lates)`, b.latePaise],
    [`Before joining (${s.notJoinedDays} ${s.notJoinedDays === 1 ? 'day' : 'days'})`, b.notJoinedPaise],
  ].filter(([, paise]) => paise > 0)
}

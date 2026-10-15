// Pure leave helpers. Dates are IST calendar days as "YYYY-MM-DD" (golden rule 11), so plain
// string comparison orders them correctly and no timezone maths is needed.

export const LEAVE_TYPES = ['paid', 'unpaid', 'sick']
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected']
// Leaves in these states block an overlapping new leave for the same employee (SPEC 4.8)
export const BLOCKING_STATUSES = ['pending', 'approved']
export const MAX_LEAVE_DAYS = 90

// Inclusive ranges [aFrom, aTo] and [bFrom, bTo] share at least one day
export function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo
}

// Calendar days in an inclusive range: 2026-10-01..2026-10-03 -> 3
export function leaveDays(fromDate, toDate) {
  const ms = new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

// True when an APPROVED leave in `leaves` covers `date` (input for deriveStatus's onApprovedLeave)
export function leaveCoversDate(leaves, date) {
  return leaves.some((l) => l.status === 'approved' && l.fromDate <= date && date <= l.toDate)
}

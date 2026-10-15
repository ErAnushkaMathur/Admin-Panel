import { weekdayOf } from './attendance.service.js'
import { shiftDurationMinutes } from './shift.service.js'
import { workingDaysInMonth } from './payroll.service.js'
import { addDays } from '../utils/time.js'

// Every status an employee can have today. Each active employee lands in exactly one bucket,
// so the buckets always add up to the staff total (SPEC section 5, mockup bug 1).
export const TODAY_BUCKETS = ['present', 'late', 'half_day', 'absent', 'on_leave', 'weekly_off', 'not_yet_in']
// Donut segments (SPEC 4.10). Late and half day are their own segments but count as "came in".
export const DONUT_BUCKETS = ['present', 'late', 'half_day', 'absent', 'on_leave']
// Statuses where the employee actually came to work
export const CAME_IN = ['present', 'late', 'half_day']
export const PERIODS = ['week', 'month', 'year']

// Share of `whole` as a percentage with one decimal; 0 when there is nothing to divide
export function percent(part, whole) {
  return whole ? Math.round((part * 1000) / whole) / 10 : 0
}

const emptyCounts = (keys) => Object.fromEntries(keys.map((k) => [k, 0]))

/**
 * Today's statuses -> counts per bucket and the "came in" figure.
 * `statuses` has one entry per active employee; a missing status (no shift) counts as not yet in.
 * total === sum of all buckets === statuses.length, always.
 */
export function summarizeToday(statuses) {
  const counts = emptyCounts(TODAY_BUCKETS)
  for (const s of statuses) counts[TODAY_BUCKETS.includes(s) ? s : 'not_yet_in'] += 1
  const total = statuses.length
  const cameIn = CAME_IN.reduce((sum, k) => sum + counts[k], 0)
  return { counts, total, cameIn, cameInPercent: percent(cameIn, total) }
}

/**
 * Today's attendance per department: came in / total. Totals add up to the staff total and
 * "came in" adds up to the Present Today KPI (mockup bug 2).
 * rows: [{ department: { _id, name, color } | null, status }]
 */
export function departmentAttendance(rows) {
  const byDept = new Map()
  for (const { department, status } of rows) {
    const key = department ? String(department._id) : 'none'
    if (!byDept.has(key)) {
      byDept.set(key, { departmentId: department?._id ?? null, name: department?.name ?? 'No department', color: department?.color ?? null, cameIn: 0, total: 0 })
    }
    const d = byDept.get(key)
    d.total += 1
    if (CAME_IN.includes(status)) d.cameIn += 1
  }
  return [...byDept.values()]
    .map((d) => ({ ...d, percent: percent(d.cameIn, d.total) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

// Inclusive date range for the donut toggle, ending today: week starts Monday, month on the 1st, year on 1 Jan
export function periodRange(period, today) {
  if (period === 'week') {
    const back = (weekdayOf(today) + 6) % 7 // Monday = 0 days back
    return { from: addDays(today, -back), to: today }
  }
  if (period === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  return { from: `${today.slice(0, 7)}-01`, to: today }
}

// Donut segments with where each one starts (cumulative %), so the UI only draws
function segmentsOf(counts, total) {
  let before = 0
  return DONUT_BUCKETS.map((status) => {
    const segment = { status, count: counts[status], percent: percent(counts[status], total), offsetPercent: percent(before, total) }
    before += counts[status]
    return segment
  })
}

/**
 * Employee-days in the period -> donut segments. Weekly offs and "not yet in" are reported
 * separately and are not part of the donut total. total === sum of the segment counts, always.
 */
export function summarizePeriod(statuses) {
  const counts = emptyCounts(DONUT_BUCKETS)
  let weeklyOff = 0
  for (const s of statuses) {
    if (DONUT_BUCKETS.includes(s)) counts[s] += 1
    else if (s === 'weekly_off') weeklyOff += 1
  }
  const total = DONUT_BUCKETS.reduce((sum, k) => sum + counts[k], 0)
  const cameIn = CAME_IN.reduce((sum, k) => sum + counts[k], 0)
  return {
    counts,
    total,
    weeklyOff,
    cameIn,
    cameInPercent: percent(cameIn, total),
    segments: segmentsOf(counts, total),
  }
}

/**
 * Full-month pay at current salary settings, ignoring attendance ("Est. Monthly Payment").
 * Monthly: the salary. Daily: rate × working days. Hourly: rate × shift hours × working days.
 * Working days = days in the month minus the employee's weekly offs.
 */
export function projectMonthlyPayPaise(salary, shift, month) {
  if (salary.type === 'monthly') return salary.amountPaise
  const workingDays = workingDaysInMonth(month, salary.weeklyOff ?? [], 'actual')
  if (salary.type === 'daily') return salary.amountPaise * workingDays
  const shiftMinutes = shift ? shiftDurationMinutes(shift.startTime, shift.endTime) : 480
  return Math.round((salary.amountPaise * shiftMinutes * workingDays) / 60)
}

/**
 * "This month so far" from calculatePayroll snapshots: basic + overtime − deductions = total
 * (mockup bug 3). Bonus and advance are payroll adjustments, not part of this card.
 */
export function salaryOverview(snapshots) {
  const basicPaise = snapshots.reduce((s, x) => s + x.basePaise, 0)
  const overtimePaise = snapshots.reduce((s, x) => s + x.overtimePaise, 0)
  const deductionsPaise = snapshots.reduce((s, x) => s + x.deductionsPaise, 0)
  return { basicPaise, overtimePaise, deductionsPaise, totalPaise: basicPaise + overtimePaise - deductionsPaise }
}

// Every date of [from, to] inclusive
export function datesBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

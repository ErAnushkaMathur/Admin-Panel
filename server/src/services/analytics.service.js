import { weekdayOf } from './attendance.service.js'
import { CAME_IN, DONUT_BUCKETS, percent } from './dashboard.service.js'
import { addDays } from '../utils/time.js'

// SPEC 4.11 Staff Analytics. Pure functions over per-day statuses that already came from
// deriveStatus (golden rule 10); the controller loads the data.

export const ATTENDANCE_RANGES = ['30d', '90d', '12m']
export const PAYROLL_RANGES = ['6m', '12m']
// Counted days: the employee was due at work (weekly offs and "not yet in" today are left out)
const COUNTED = DONUT_BUCKETS // present, late, half_day, absent, on_leave
// Monday-first weekday order for the absentee chart (0 = Sunday … 6 = Saturday)
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
// A repeat-absence pattern: at least this many absences on one weekday, at least this share of them
export const PATTERN_MIN_ABSENCES = 3
export const PATTERN_MIN_PERCENT = 50
const RANKING_SIZE = 10

const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1
const monthOf = (date) => date.slice(0, 7)
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const lastDayOfMonth = (month) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const mondayOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7))

/**
 * Date window for a range, ending today, plus the equal-length window just before it
 * (for "vs previous period"). 30d -> daily points, 90d -> weekly (Monday) points,
 * 12m -> monthly points from the 1st of the month 11 months back.
 */
export function analyticsRange(range, today) {
  let from
  let bucket
  if (range === '12m') {
    from = `${shiftMonth(monthOf(today), -11)}-01`
    bucket = 'month'
  } else if (range === '90d') {
    from = addDays(today, -89)
    bucket = 'week'
  } else {
    from = addDays(today, -29)
    bucket = 'day'
  }
  const length = daysBetween(from, today)
  return { range, from, to: today, bucket, previousFrom: addDays(from, -length), previousTo: addDays(from, -1) }
}

// Buckets covering [from, to] in order, each clipped to the window: [{ key, from, to }]
export function bucketsFor(from, to, bucket) {
  const out = []
  let start = from
  while (start <= to) {
    let end
    if (bucket === 'month') end = lastDayOfMonth(monthOf(start))
    else if (bucket === 'week') end = addDays(mondayOf(start), 6)
    else end = start
    if (end > to) end = to
    out.push({ key: bucket === 'month' ? monthOf(start) : start, from: start, to: end })
    start = addDays(end, 1)
  }
  return out
}

const emptyCounts = () => Object.fromEntries(COUNTED.map((k) => [k, 0]))
const inWindow = (date, from, to) => date >= from && date <= to

/**
 * Attendance trend: per bucket, counted employee-days by status and the share that came in
 * (on time + late + half day). total === sum of counts, always.
 * employees: [{ days: [{ date, status }] }]
 */
export function attendanceTrend(employees, { from, to, bucket }) {
  const buckets = bucketsFor(from, to, bucket).map((b) => ({ ...b, counts: emptyCounts() }))
  const index = new Map()
  for (const b of buckets) for (let d = b.from; d <= b.to; d = addDays(d, 1)) index.set(d, b)
  for (const e of employees) {
    for (const day of e.days) {
      const b = index.get(day.date)
      if (b && COUNTED.includes(day.status)) b.counts[day.status] += 1
    }
  }
  return buckets.map((b) => {
    const total = COUNTED.reduce((s, k) => s + b.counts[k], 0)
    const cameIn = CAME_IN.reduce((s, k) => s + b.counts[k], 0)
    return { ...b, total, cameIn, cameInPercent: total ? percent(cameIn, total) : null }
  })
}

// Name, code, role and department as the analytics screens show them
const who = ({ employee: e, department }) => ({
  _id: e._id,
  name: e.name,
  employeeCode: e.employeeCode,
  roleTitle: e.roleTitle,
  department: department ? { _id: department._id, name: department.name, color: department.color } : null,
})

/**
 * Late-arrival ranking in [from, to]: most late days first, then most late minutes.
 * Late = status 'late' (a half day overrides late, as in payroll). Only employees with lates.
 */
export function lateRanking(employees, { from, to }, size = RANKING_SIZE) {
  return employees
    .map((e) => {
      let lateDays = 0
      let lateMinutes = 0
      let cameInDays = 0
      for (const day of e.days) {
        if (!inWindow(day.date, from, to)) continue
        if (CAME_IN.includes(day.status)) cameInDays += 1
        if (day.status === 'late') {
          lateDays += 1
          lateMinutes += day.lateMinutes
        }
      }
      return {
        employee: who(e),
        lateDays,
        lateMinutes,
        averageLateMinutes: lateDays ? Math.round(lateMinutes / lateDays) : 0,
        cameInDays,
        latePercent: percent(lateDays, cameInDays),
      }
    })
    .filter((r) => r.lateDays > 0)
    .sort((a, b) => b.lateDays - a.lateDays || b.lateMinutes - a.lateMinutes || a.employee.name.localeCompare(b.employee.name))
    .slice(0, size)
}

/**
 * Overtime minutes per department in [from, to] vs the previous window of the same length.
 * Overtime = minutes beyond the shift on days the employee came in (deriveStatus metrics).
 * changePercent is null when the previous period had none (no meaningful %).
 */
export function overtimeByDepartment(employees, { from, to, previousFrom, previousTo }) {
  const byDept = new Map()
  for (const e of employees) {
    const key = e.department ? String(e.department._id) : 'none'
    if (!byDept.has(key)) {
      byDept.set(key, {
        departmentId: e.department?._id ?? null,
        name: e.department?.name ?? 'No department',
        color: e.department?.color ?? null,
        minutes: 0,
        previousMinutes: 0,
        employeesWithOvertime: 0,
      })
    }
    const d = byDept.get(key)
    let mine = 0
    for (const day of e.days) {
      if (!CAME_IN.includes(day.status)) continue
      if (inWindow(day.date, from, to)) mine += day.overtimeMinutes
      else if (inWindow(day.date, previousFrom, previousTo)) d.previousMinutes += day.overtimeMinutes
    }
    d.minutes += mine
    if (mine > 0) d.employeesWithOvertime += 1
  }
  const change = (now, before) => (before ? Math.round(((now - before) * 1000) / before) / 10 : null)
  const departments = [...byDept.values()]
    .map((d) => ({ ...d, changePercent: change(d.minutes, d.previousMinutes) }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
  const totalMinutes = departments.reduce((s, d) => s + d.minutes, 0)
  const previousTotalMinutes = departments.reduce((s, d) => s + d.previousMinutes, 0)
  return {
    departments: departments.map((d) => ({ ...d, sharePercent: percent(d.minutes, totalMinutes) })),
    totalMinutes,
    previousTotalMinutes,
    changePercent: change(totalMinutes, previousTotalMinutes),
  }
}

/**
 * Absences by weekday in [from, to] (Monday first): absent days ÷ days staff were due.
 * Plus repeat patterns per employee, e.g. "absent 4 of 6 Mondays" (SPEC 4.11, 4.13).
 * Only status 'absent' counts as an absence; leave is planned, not an absence.
 */
export function absenteePatterns(employees, { from, to }) {
  const totals = new Map(WEEKDAY_ORDER.map((w) => [w, { weekday: w, absentDays: 0, dueDays: 0 }]))
  const patterns = []
  for (const e of employees) {
    const mine = new Map()
    for (const day of e.days) {
      if (!inWindow(day.date, from, to) || !COUNTED.includes(day.status)) continue
      const w = weekdayOf(day.date)
      const absent = day.status === 'absent' ? 1 : 0
      totals.get(w).dueDays += 1
      totals.get(w).absentDays += absent
      if (!mine.has(w)) mine.set(w, { absentDays: 0, dueDays: 0 })
      mine.get(w).dueDays += 1
      mine.get(w).absentDays += absent
    }
    for (const [weekday, c] of mine) {
      const absentPercent = percent(c.absentDays, c.dueDays)
      if (c.absentDays >= PATTERN_MIN_ABSENCES && absentPercent >= PATTERN_MIN_PERCENT) {
        patterns.push({ employee: who(e), weekday, absentDays: c.absentDays, dueDays: c.dueDays, absentPercent })
      }
    }
  }
  patterns.sort((a, b) => b.absentDays - a.absentDays || b.absentPercent - a.absentPercent || a.employee.name.localeCompare(b.employee.name))
  const byWeekday = WEEKDAY_ORDER.map((w) => {
    const t = totals.get(w)
    return { ...t, absentPercent: percent(t.absentDays, t.dueDays) }
  })
  return { byWeekday, patterns: patterns.slice(0, RANKING_SIZE) }
}

// Months of a payroll range, oldest first, ending with the current month
export function payrollMonths(range, today) {
  const count = range === '6m' ? 6 : 12
  const current = monthOf(today)
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)))
}

const MONEY = ['basePaise', 'overtimePaise', 'deductionsPaise', 'bonusPaise', 'advancePaise', 'netPaise']

/**
 * Payroll cost per month from stored payroll snapshots (golden rule 5: finalized numbers are
 * never recomputed). status: 'final' when every row is finalized or paid, 'draft' when none is,
 * 'mixed' otherwise; months without payroll have hasData false and zero amounts.
 * rows: [{ month, status, snapshot }]
 */
export function payrollTrend(rows, months) {
  const points = months.map((month) => ({ month, hasData: false, employees: 0, status: null, ...Object.fromEntries(MONEY.map((k) => [k, 0])) }))
  const byMonth = new Map(points.map((p) => [p.month, p]))
  const finalRows = new Map()
  for (const r of rows) {
    const p = byMonth.get(r.month)
    if (!p) continue
    p.hasData = true
    p.employees += 1
    for (const k of MONEY) p[k] += r.snapshot[k] ?? 0
    if (r.status !== 'draft') finalRows.set(r.month, (finalRows.get(r.month) ?? 0) + 1)
  }
  for (const p of points) {
    if (!p.hasData) continue
    const final = finalRows.get(p.month) ?? 0
    p.status = final === p.employees ? 'final' : final === 0 ? 'draft' : 'mixed'
  }
  const finalPoints = points.filter((p) => p.status === 'final')
  return {
    months: points,
    finalTotalNetPaise: finalPoints.reduce((s, p) => s + p.netPaise, 0),
    finalMonths: finalPoints.length,
    averageFinalNetPaise: finalPoints.length ? Math.round(finalPoints.reduce((s, p) => s + p.netPaise, 0) / finalPoints.length) : 0,
  }
}

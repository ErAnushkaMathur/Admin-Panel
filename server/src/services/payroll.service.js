import { deriveDayStatus, weekdayOf } from './attendance.service.js'
import { shiftDurationMinutes } from './shift.service.js'
import { todayIST } from '../utils/time.js'

export const PAYROLL_STATUSES = ['draft', 'finalized', 'paid']
export const WORKING_DAYS_POLICIES = ['actual', 'fixed26']
// Approved leave of these types is paid; 'unpaid' is deducted. "On leave" set by hand in Attendance
// without an approved leave record behind it is unpaid (nobody can mark a day off and get it paid).
export const PAID_LEAVE_TYPES = ['paid', 'sick']
export const DEFAULT_PAYROLL_SETTINGS = { workingDaysPolicy: 'actual', overtimeEnabled: true, lateRule: null }

// "2026-09" -> ["2026-09-01", …, "2026-09-30"]
export function daysOfMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

// SPEC 4.9 setting: 26 fixed, or the actual days in the month minus the employee's weekly offs
export function workingDaysInMonth(month, weeklyOff = [], policy = 'actual') {
  if (policy === 'fixed26') return 26
  return daysOfMonth(month).filter((d) => !weeklyOff.includes(weekdayOf(d))).length
}

const sumValues = (o) => Object.values(o).reduce((a, b) => a + b, 0)

/**
 * SPEC 4.9 payroll for one employee and one month. Pure: everything comes in as arguments.
 *
 *   employee    { joinDate, shift, salary: { type, amountPaise, overtimeMultiplier, weeklyOff } }
 *   attendance  the month's attendance records ({ date, punchIn, punchOut, manualStatus, shiftSnapshot })
 *   leaves      the employee's leave records (only approved ones count)
 *   settings    { month, halfDayThresholdMinutes, workingDaysPolicy, overtimeEnabled, lateRule: { every } | null, now }
 *   adjustments { bonusPaise, advancePaise } entered by the owner
 *
 * Every day's status comes from deriveDayStatus -> deriveStatus, exactly as on the Attendance page.
 * Days before joining are not employed; days after today (current month) are not counted yet.
 *
 * Monthly: base = full salary; one day's pay = salary ÷ working days. Deducted: absent days, unpaid
 *   leave, ½ per half day, late cuts and working days before joining (weekly offs never deducted).
 * Daily:   base = day rate × (present + late + ½ × half days + paid leave on working days).
 * Hourly:  base = rate × hours worked (overtime hours paid separately at rate × multiplier).
 * Overtime = minutes beyond the shift × hourly rate × multiplier, only when enabled.
 * net = base + overtime + bonus − deductions − advance, never below 0 (the shortfall is reported).
 * All money is integer paise; each amount is rounded once, from exact inputs.
 */
export function calculatePayroll(employee, attendance, leaves, settings, adjustments = {}) {
  const { month, halfDayThresholdMinutes, now } = settings
  const workingDaysPolicy = settings.workingDaysPolicy ?? DEFAULT_PAYROLL_SETTINGS.workingDaysPolicy
  const overtimeEnabled = settings.overtimeEnabled ?? DEFAULT_PAYROLL_SETTINGS.overtimeEnabled
  const lateRule = settings.lateRule ?? null
  const { type, amountPaise, overtimeMultiplier = 1.5, weeklyOff = [] } = employee.salary
  const bonusPaise = adjustments.bonusPaise ?? 0
  const advancePaise = adjustments.advancePaise ?? 0

  const today = todayIST(now)
  const approvedLeaves = leaves.filter((l) => l.status === 'approved')
  const recordByDate = new Map(attendance.map((r) => [r.date, r]))

  const counts = {
    presentDays: 0, // on time
    lateDays: 0,
    halfDays: 0,
    absentDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    weeklyOffDays: 0,
    notJoinedDays: 0, // working days before the join date
  }
  // Working-day units that lose (monthly) or earn (daily) pay
  let absentUnits = 0
  let unpaidLeaveUnits = 0
  let halfDayUnits = 0
  let paidLeaveWorkingDays = 0
  let workedDays = 0 // present + late (any day, including a weekly off they chose to work)
  let workedMinutes = 0
  let overtimeMinutes = 0
  let countedThrough = null
  const days = []

  for (const date of daysOfMonth(month)) {
    const record = recordByDate.get(date) ?? null
    const offDay = weeklyOff.includes(weekdayOf(date))

    if (!record && date < employee.joinDate) {
      if (!offDay) counts.notJoinedDays += 1
      days.push({ date, status: 'not_joined' })
      continue
    }
    if (!record && date > today) {
      days.push({ date, status: null })
      continue
    }

    const derived = deriveDayStatus({ date, record, shift: employee.shift, weeklyOff, leaves: approvedLeaves, halfDayThresholdMinutes, now })
    const { status } = derived
    if (!status || status === 'not_yet_in') {
      days.push({ date, status: null })
      continue
    }
    countedThrough = date
    const day = { date, status }

    if (status === 'present' || status === 'late' || status === 'half_day') {
      workedMinutes += derived.workedMinutes
      overtimeMinutes += derived.overtimeMinutes
    }
    if (status === 'present') {
      counts.presentDays += 1
      workedDays += 1
    } else if (status === 'late') {
      counts.lateDays += 1
      workedDays += 1
    } else if (status === 'half_day') {
      counts.halfDays += 1
      if (!offDay) halfDayUnits += 0.5
    } else if (status === 'weekly_off') {
      counts.weeklyOffDays += 1
    } else if (status === 'absent') {
      counts.absentDays += 1
      if (!offDay) absentUnits += 1
    } else if (status === 'on_leave') {
      const leave = approvedLeaves.find((l) => l.fromDate <= date && date <= l.toDate) ?? null
      const paid = Boolean(leave && PAID_LEAVE_TYPES.includes(leave.type))
      day.leaveType = leave?.type ?? null
      day.paid = paid
      if (paid) {
        counts.paidLeaveDays += 1
        if (!offDay) paidLeaveWorkingDays += 1
      } else {
        counts.unpaidLeaveDays += 1
        if (!offDay) unpaidLeaveUnits += 1
      }
    }
    days.push(day)
  }

  const lateCount = counts.lateDays
  const lateCuts = lateRule?.every ? Math.floor(lateCount / lateRule.every) : 0
  const shiftMinutes = employee.shift ? shiftDurationMinutes(employee.shift.startTime, employee.shift.endTime) : 480
  const workingDays = workingDaysInMonth(month, weeklyOff, type === 'monthly' ? workingDaysPolicy : 'actual')

  let basePaise = 0
  let overtimePaise = 0
  let perDayPaise = null
  const deductionBreakdown = { absentPaise: 0, unpaidLeavePaise: 0, halfDayPaise: 0, latePaise: 0, notJoinedPaise: 0 }

  if (type === 'monthly') {
    // One day's pay = amount ÷ workingDays; computed per item from exact values, rounded once
    const daysPay = (units) => Math.round((amountPaise * units) / workingDays)
    perDayPaise = daysPay(1)
    basePaise = amountPaise
    deductionBreakdown.absentPaise = daysPay(absentUnits)
    deductionBreakdown.unpaidLeavePaise = daysPay(unpaidLeaveUnits)
    deductionBreakdown.halfDayPaise = daysPay(halfDayUnits)
    deductionBreakdown.latePaise = daysPay(lateCuts * 0.5)
    deductionBreakdown.notJoinedPaise = daysPay(counts.notJoinedDays)
    if (overtimeEnabled) overtimePaise = Math.round((overtimeMinutes * amountPaise * overtimeMultiplier) / (workingDays * shiftMinutes))
  } else if (type === 'daily') {
    perDayPaise = amountPaise
    basePaise = Math.round(amountPaise * (workedDays + counts.halfDays * 0.5 + paidLeaveWorkingDays))
    deductionBreakdown.latePaise = Math.round(amountPaise * lateCuts * 0.5)
    if (overtimeEnabled) overtimePaise = Math.round((overtimeMinutes * amountPaise * overtimeMultiplier) / shiftMinutes)
  } else {
    // Hourly: overtime hours are paid once, at rate × multiplier; with overtime off, all hours at the normal rate
    const normalMinutes = overtimeEnabled ? workedMinutes - overtimeMinutes : workedMinutes
    basePaise = Math.round((normalMinutes * amountPaise) / 60)
    if (overtimeEnabled) overtimePaise = Math.round((overtimeMinutes * amountPaise * overtimeMultiplier) / 60)
  }

  const deductionsPaise = sumValues(deductionBreakdown)
  const beforeAdvancePaise = Math.max(0, basePaise + overtimePaise + bonusPaise - deductionsPaise)
  const netPaise = Math.max(0, beforeAdvancePaise - advancePaise)
  const unrecoveredAdvancePaise = Math.max(0, advancePaise - beforeAdvancePaise)

  return {
    snapshot: {
      month,
      salaryType: type,
      salaryAmountPaise: amountPaise,
      overtimeMultiplier,
      weeklyOff: [...weeklyOff],
      workingDaysPolicy,
      overtimeEnabled,
      lateRuleEvery: lateRule?.every ?? null,
      halfDayThresholdMinutes,
      shiftMinutes,
      countedThrough,
      workingDays,
      ...counts,
      lateCount,
      lateCuts,
      workedMinutes,
      overtimeMinutes,
      perDayPaise,
      basePaise,
      overtimePaise,
      deductionBreakdown,
      deductionsPaise,
      bonusPaise,
      advancePaise,
      netPaise,
      unrecoveredAdvancePaise,
    },
    days,
  }
}
